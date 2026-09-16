import asyncio
from types import SimpleNamespace

from app.core.config import Settings
from app.llm import openai_compatible


def test_responses_stream_is_adapted_to_text(monkeypatch) -> None:
    calls: dict[str, object] = {}

    class FakeEvents:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            calls["stream_closed"] = True

        async def __aiter__(self):
            yield SimpleNamespace(type="response.created")
            yield SimpleNamespace(type="response.output_text.delta", delta="你好")
            yield SimpleNamespace(type="response.output_text.delta", delta="！")

    class FakeResponses:
        async def create(self, **kwargs):
            calls["request"] = kwargs
            return FakeEvents()

    class FakeClient:
        def __init__(self, **kwargs):
            calls["client"] = kwargs
            self.responses = FakeResponses()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            calls["client_closed"] = True

    monkeypatch.setattr(openai_compatible, "AsyncOpenAI", FakeClient)
    settings = Settings(_env_file=None, llm_api_key="test-key", llm_model="test-model")
    provider = openai_compatible.OpenAICompatibleProvider(settings)

    async def collect() -> list[str]:
        return [text async for text in provider.stream("问题", "系统提示")]

    assert asyncio.run(collect()) == ["你好", "！"]
    assert calls["request"] == {
        "model": "test-model", "instructions": "系统提示", "input": "问题", "stream": True,
    }
    assert calls["stream_closed"] is True
    assert calls["client_closed"] is True

    async def stop_after_first_chunk() -> str:
        stream = provider.stream("问题", "系统提示")
        first = await anext(stream)
        await stream.aclose()
        return first

    calls["stream_closed"] = False
    calls["client_closed"] = False
    assert asyncio.run(stop_after_first_chunk()) == "你好"
    assert calls["stream_closed"] is True
    assert calls["client_closed"] is True
