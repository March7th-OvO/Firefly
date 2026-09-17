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


def test_current_page_question_uses_page_context_without_article_index() -> None:
    provider = RecordingProvider()
    request = ChatRequest.model_validate({
        "message": "当前页面是什么？",
        "context": {"title": "归档", "url": "/archive/"},
    })

    async def collect() -> list[str]:
        return [text async for text in ChatService(provider).stream(request)]

    assert asyncio.run(collect()) == ["当前页面是「归档」（/archive/）。"]
    assert provider.received is None


def test_page_context_is_added_to_normal_prompt_but_404_is_excluded() -> None:
    provider = RecordingProvider()

    async def collect(request: ChatRequest) -> None:
        _ = [text async for text in ChatService(provider).stream(request)]

    asyncio.run(collect(ChatRequest.model_validate({
        "message": "你好", "context": {"title": "标签", "url": "/tags/"},
    })))
    assert provider.received is not None
    assert '"title": "标签", "url": "/tags/"' in provider.received[1]

    asyncio.run(collect(ChatRequest.model_validate({
        "message": "你好", "context": {"title": "404", "url": "/404/"},
    })))
    assert provider.received is not None
    assert "Current site page" not in provider.received[1]
