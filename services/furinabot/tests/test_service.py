import asyncio
from collections.abc import AsyncIterator

from app.llm.base import LLMProvider
from app.schemas.chat import ChatRequest
from app.services.chat import ChatService


class RecordingProvider(LLMProvider):
    def __init__(self) -> None:
        self.received: tuple[str, str] | None = None

    async def stream(self, message: str, system_prompt: str) -> AsyncIterator[str]:
        self.received = (message, system_prompt)
        yield "第一段"
        yield "第二段"


def test_chat_service_uses_provider_and_system_prompt() -> None:
    provider = RecordingProvider()

    async def collect() -> list[str]:
        return [text async for text in ChatService(provider).stream(ChatRequest(message="你好"))]

    assert asyncio.run(collect()) == ["第一段", "第二段"]
    assert provider.received is not None
    assert provider.received[0] == "你好"
    assert "芙宁娜的口吻" in provider.received[1]


def test_chat_service_uses_custom_system_prompt() -> None:
    provider = RecordingProvider()

    async def collect() -> list[str]:
        return [text async for text in ChatService(provider, system_prompt="自定义芙宁娜提示词").stream(ChatRequest(message="你好"))]

    assert asyncio.run(collect()) == ["第一段", "第二段"]
    assert provider.received == ("你好", "自定义芙宁娜提示词")
