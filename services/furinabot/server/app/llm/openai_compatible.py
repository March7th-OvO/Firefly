from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from app.core.config import Settings
from app.llm.base import LLMProvider


class MissingAPIKeyError(RuntimeError):
    """模型服务尚未配置密钥。"""


class OpenAICompatibleProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def stream(self, message: str, system_prompt: str) -> AsyncIterator[str]:
        if not self.settings.llm_api_key:
            raise MissingAPIKeyError("服务端尚未配置 LLM_API_KEY。")

        # SDK 与 Responses API 的事件格式只在此处出现。
        async with AsyncOpenAI(
            api_key=self.settings.llm_api_key,
            base_url=self.settings.llm_base_url,
        ) as client:
            async with await client.responses.create(
                model=self.settings.llm_model,
                instructions=system_prompt,
                input=message,
                stream=True,
            ) as events:
                async for event in events:
                    if event.type == "response.output_text.delta":
                        yield event.delta
                    elif event.type in {"response.failed", "response.incomplete", "error"}:
                        raise RuntimeError("模型未能完成生成。")
