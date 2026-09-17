import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

from app.core.config import DEFAULT_SYSTEM_PROMPT
from app.llm.base import LLMProvider
from app.schemas.chat import ChatRequest
from app.services.article import ArticleService
from app.services.input_guard import AliyunInputGuard
from app.services.retrieval import RetrievalService

@dataclass
class ChatPlan:
    mode: str
    prompt: str
    sources: list[dict]
    direct_answer: str | None = None


def route_request(message: str, has_article: bool) -> str:
    cross_article = bool(re.search(r"以前|之前|其他文章|跨文章|全站|结合.*文章|博客里|历史文章|previous|across articles", message, re.I))
    current_article = bool(re.search(r"这篇|本文|本篇|当前文章|这段|this article|current article", message, re.I))
    catalog = bool(re.search(r"哪些文章|有什么文章|有没有.*文章|写过.*文章|写过.*系列|文章列表|哪些.*相关内容|list.*articles|articles.*about", message, re.I))
    if has_article and current_article and not cross_article:
        return "current"
    if catalog:
        return "catalog"
    if has_article and not cross_article:
        return "current"
    return "retrieval"


class ChatService:
    def __init__(
        self,
        provider: LLMProvider,
        article_service: ArticleService | None = None,
        retrieval_service: RetrievalService | None = None,
        system_prompt: str = DEFAULT_SYSTEM_PROMPT,
        input_guard: AliyunInputGuard | None = None,
    ) -> None:
        self.provider = provider
        self.article_service = article_service
        self.retrieval_service = retrieval_service
        self.system_prompt = system_prompt
        self.input_guard = input_guard

    async def prepare(self, request: ChatRequest) -> ChatPlan:
        if not self.article_service:
            return ChatPlan("none", self.system_prompt, [])
        catalog = await self.article_service.list_articles()
        article_id = request.context.article_id if request.context else None
        mode = route_request(request.message, bool(article_id))
        if mode == "current" and article_id:
            article = await self.article_service.get_article(article_id)
            if article:
                metadata = next((item for item in catalog if item.get("id") == article_id), None)
                source = {key: metadata[key] for key in ("id", "title", "url")} if metadata else []
                return ChatPlan("current", self.system_prompt + "\nCurrent public article:\n" + json.dumps(article, ensure_ascii=False), [source] if source else [])
            # Invalid client IDs never grant access and cannot be trusted as evidence.
            mode = "retrieval"
        if mode == "catalog":
            # Explicit Latin topics can be checked exactly against the public metadata.
            topics = [word.casefold() for word in re.findall(r"[A-Za-z][A-Za-z0-9.+-]{2,}", request.message)
                      if word.casefold() not in {"furinafans", "blog", "articles", "article", "about", "list"}]
            if topics:
                matches = [article for article in catalog if any(
                    topic in json.dumps(article, ensure_ascii=False).casefold() for topic in topics
                )]
                if not matches:
                    return ChatPlan("catalog", self.system_prompt, [], "当前公开文章中没有找到相关内容。")
                catalog = matches
            prompt = self.system_prompt + "\nPublic article catalog matching the question:\n" + json.dumps(catalog, ensure_ascii=False)
            sources = [{key: article[key] for key in ("id", "title", "url")} for article in catalog] if topics else []
            return ChatPlan("catalog", prompt, sources)
        if self.retrieval_service:
            hits = await self.retrieval_service.search(request.message)
            if hits:
                prompt = self.system_prompt + "\nRelevant public article excerpts:\n" + json.dumps([hit.chunk for hit in hits], ensure_ascii=False)
                return ChatPlan("retrieval", prompt, [hit.source() for hit in hits])
        return ChatPlan("retrieval", self.system_prompt, [], "当前公开文章中没有找到相关内容。")

    async def stream(self, request: ChatRequest, plan: ChatPlan | None = None) -> AsyncIterator[str]:
        plan = plan or await self.prepare(request)
        if plan.direct_answer:
            yield plan.direct_answer
            return
        async for text in self.provider.stream(request.message, plan.prompt):
            yield text
