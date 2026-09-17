import asyncio
import json
from collections.abc import AsyncIterator

from app.llm.base import LLMProvider
from app.schemas.chat import ChatRequest, PageContext
from app.services.article import ArticleService
from app.services.chat import ChatService


class RecordingProvider(LLMProvider):
    prompt = ""

    async def stream(self, message: str, system_prompt: str) -> AsyncIterator[str]:
        self.prompt = system_prompt
        yield "ok"


def test_public_index_and_current_article(tmp_path) -> None:
    (tmp_path / "articles").mkdir()
    (tmp_path / "articles.json").write_text(json.dumps({"version": 1, "articles": [
        {"id": "cloudflare", "title": "Cloudflare", "description": "R2", "tags": ["Cloudflare"], "url": "/posts/cloudflare/"},
    ]}), encoding="utf-8")
    (tmp_path / "articles" / "cloudflare.json").write_text(json.dumps({"id": "cloudflare", "content": "真实正文"}), encoding="utf-8")
    (tmp_path / "articles" / "secret.json").write_text(json.dumps({"id": "secret", "content": "秘密"}), encoding="utf-8")
    service = ArticleService(tmp_path)
    provider = RecordingProvider()

    async def run() -> None:
        assert len(await service.search_articles("Cloudflare")) == 1
        assert await service.search_articles("Kubernetes") == []
        assert await service.get_article("secret") is None
        assert await service.get_article("../secret") is None
        result = [part async for part in ChatService(provider, service).stream(ChatRequest(
            message="这篇文章讲什么？", context=PageContext(article_id="cloudflare", title="伪造标题", url="/fake/"),
        ))]
        assert result == ["ok"]
        page = [part async for part in ChatService(provider, service).stream(ChatRequest(
            message="当前页面是什么？", context=PageContext(article_id="cloudflare", title="伪造标题", url="/fake/"),
        ))]
        assert page == ["当前页面是「Cloudflare」（/posts/cloudflare/）。"]

    asyncio.run(run())
    assert "真实正文" in provider.prompt
    assert "伪造标题" not in provider.prompt
    assert "秘密" not in provider.prompt
