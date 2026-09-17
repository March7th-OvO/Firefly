import logging
from collections.abc import AsyncIterable
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.core.config import Settings, get_settings
from app.llm.openai_compatible import MissingAPIKeyError, OpenAICompatibleProvider
from app.schemas.chat import ChatRequest
from app.services.chat import ChatService, route_request
from app.services.article import ArticleService
from app.services.input_guard import AliyunInputGuard, InputGuardRejected, InputGuardTooLong, InputGuardUnavailable
from app.services.retrieval import RetrievalService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/agent", tags=["agent"])


def get_chat_service(settings: Annotated[Settings, Depends(get_settings)]) -> ChatService:
    return ChatService(
        OpenAICompatibleProvider(settings),
        ArticleService(settings.furinafans_content_dir),
        RetrievalService(settings.furinafans_content_dir, settings.furinabot_vector_db, settings),
        system_prompt=settings.llm_system_prompt,
        input_guard=AliyunInputGuard(settings) if settings.aliyun_guard_enabled else None,
    )


# 保留无斜杠的既有 API，同时支持 Astro 开发代理使用的末尾斜杠路径。
@router.post("/chat/", response_class=EventSourceResponse, include_in_schema=False)
@router.post("/chat", response_class=EventSourceResponse)
async def chat(
    request: ChatRequest,
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> AsyncIterable[ServerSentEvent]:
    try:
        if service.input_guard:
            await service.input_guard.check(request.message)
        yield ServerSentEvent(event="message.start", data={"messageId": str(uuid4())})
        searching = service.retrieval_service is not None and route_request(
            request.message, bool(request.context and request.context.article_id)
        ) == "retrieval"
        if searching:
            yield ServerSentEvent(event="retrieval.start", data={})
        plan = await service.prepare(request)
        if plan.mode == "retrieval":
            if not searching:
                yield ServerSentEvent(event="retrieval.start", data={})
            yield ServerSentEvent(event="retrieval.result", data={"count": len(plan.sources)})
        async for text in service.stream(request, plan):
            yield ServerSentEvent(event="message.delta", data={"text": text})
        if plan.sources:
            yield ServerSentEvent(event="message.sources", data={"sources": plan.sources})
    except InputGuardRejected:
        yield ServerSentEvent(event="error", data={"code": "input_blocked", "message": "这条消息未通过安全审核，请换一种方式提问。"})
        return
    except InputGuardTooLong:
        yield ServerSentEvent(event="error", data={"code": "input_too_long", "message": "消息超过 2000 字，请缩短后重试。"})
        return
    except InputGuardUnavailable:
        logger.warning("Input guard unavailable; request was not sent to the model")
        yield ServerSentEvent(event="error", data={"code": "guard_unavailable", "message": "安全审核暂时不可用，请稍后重试。"})
        return
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
