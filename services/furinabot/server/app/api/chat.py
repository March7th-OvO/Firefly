import logging
from collections.abc import AsyncIterable
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.core.config import Settings, get_settings
from app.llm.openai_compatible import MissingAPIKeyError, OpenAICompatibleProvider
from app.schemas.chat import ChatRequest
from app.services.chat import ChatService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agent", tags=["agent"])


def get_chat_service(settings: Annotated[Settings, Depends(get_settings)]) -> ChatService:
    return ChatService(OpenAICompatibleProvider(settings))


@router.post("/chat", response_class=EventSourceResponse)
async def chat(
    request: ChatRequest,
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> AsyncIterable[ServerSentEvent]:
    yield ServerSentEvent(event="message.start", data={"messageId": str(uuid4())})

    try:
        async for text in service.stream(request):
            yield ServerSentEvent(event="message.delta", data={"text": text})
    except MissingAPIKeyError as error:
        yield ServerSentEvent(
            event="error",
            data={"code": "llm_not_configured", "message": str(error)},
        )
        return
    except Exception:
        # 异常只进入服务端日志，避免向浏览器泄露供应商返回的敏感细节。
        logger.exception("Chat generation failed")
        yield ServerSentEvent(
            event="error",
            data={"code": "generation_failed", "message": "回复暂时失败，请稍后重试。"},
        )
        return

    yield ServerSentEvent(event="message.done", data={})
