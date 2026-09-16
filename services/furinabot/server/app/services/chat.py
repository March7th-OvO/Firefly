from collections.abc import AsyncIterator

from app.llm.base import LLMProvider
from app.schemas.chat import ChatRequest

SYSTEM_PROMPT = """You are FurinaBot, the AI assistant for FurinaFans.

Respond clearly and concisely.
Use Markdown when appropriate.
Do not claim to know FurinaFans content unless it is provided in context.
"""


class ChatService:
    def __init__(self, provider: LLMProvider) -> None:
        self.provider = provider

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        # 此阶段仅转发用户消息；页面标题和 URL 不等于文章正文。
        async for text in self.provider.stream(request.message, SYSTEM_PROMPT):
            yield text
