import json
from collections.abc import AsyncIterator

from fastapi.testclient import TestClient

from app.api.chat import get_chat_service
from app.core.config import Settings
from app.llm.base import LLMProvider
from app.llm.openai_compatible import OpenAICompatibleProvider
from app.main import app
from app.services.chat import ChatService


class FakeProvider(LLMProvider):
    async def stream(self, message: str, system_prompt: str) -> AsyncIterator[str]:
        _ = message, system_prompt
        yield "你好"
        yield "，旅行者。"


class FailingProvider(LLMProvider):
    async def stream(self, message: str, system_prompt: str) -> AsyncIterator[str]:
        _ = message, system_prompt
        yield "部分内容"
        raise RuntimeError("secret provider detail")


def parse_events(body: str) -> list[tuple[str, dict]]:
    events = []
    for frame in body.strip().split("\n\n"):
        fields = dict(line.split(": ", 1) for line in frame.splitlines())
        events.append((fields["event"], json.loads(fields["data"])))
    return events


def test_health_and_docs() -> None:
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok", "service": "FurinaBot"}
        assert client.get("/docs").status_code == 200


def test_chat_sse_protocol() -> None:
    app.dependency_overrides[get_chat_service] = lambda: ChatService(FakeProvider())
    try:
        with TestClient(app) as client:
            response = client.post("/api/agent/chat", json={"message": "你好"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    events = parse_events(response.text)
    assert [event for event, _ in events] == [
        "message.start", "message.delta", "message.delta", "message.done",
    ]
    assert events[0][1]["messageId"]
    assert events[1][1] == {"text": "你好"}
    assert events[-1][1] == {}


def test_missing_api_key_returns_error_event() -> None:
    settings = Settings(_env_file=None, llm_api_key="")
    app.dependency_overrides[get_chat_service] = lambda: ChatService(OpenAICompatibleProvider(settings))
    try:
        with TestClient(app) as client:
            response = client.post("/api/agent/chat", json={"message": "你好"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    events = parse_events(response.text)
    assert [event for event, _ in events] == ["message.start", "error"]
    assert events[1][1]["code"] == "llm_not_configured"


def test_provider_failure_returns_safe_error_event() -> None:
    app.dependency_overrides[get_chat_service] = lambda: ChatService(FailingProvider())
    try:
        with TestClient(app) as client:
            response = client.post("/api/agent/chat", json={"message": "你好"})
    finally:
        app.dependency_overrides.clear()

    events = parse_events(response.text)
    assert [event for event, _ in events] == ["message.start", "message.delta", "error"]
    assert events[-1][1]["code"] == "generation_failed"
    assert "secret provider detail" not in response.text


def test_blank_message_is_rejected() -> None:
    with TestClient(app) as client:
        response = client.post("/api/agent/chat", json={"message": "   "})

    assert response.status_code == 422
