"""Review user text before retrieval or model generation."""

import asyncio
import json

from alibabacloud_green20220302.client import Client
from alibabacloud_green20220302.models import MultiModalGuardRequest
from alibabacloud_tea_openapi.models import Config

from app.core.config import Settings


class InputGuardRejected(Exception):
    """The guard recommends that this message not reach the model."""


class InputGuardTooLong(Exception):
    """The message exceeds Aliyun's synchronous text limit."""


class InputGuardUnavailable(Exception):
    """The guard could not return a usable decision."""


class AliyunInputGuard:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def check(self, message: str) -> None:
        # 阿里云同步文本审核每次最多接受 2000 字符，不能截断后只审核部分输入。
        if len(message) > 2000:
            raise InputGuardTooLong()
        if not self.settings.alibaba_cloud_access_key_id or not self.settings.alibaba_cloud_access_key_secret:
            raise InputGuardUnavailable()
        # SDK 是同步调用；放在线程里避免阻塞其他聊天请求的 SSE 事件循环。
        await asyncio.to_thread(self._check_sync, message)

    def _check_sync(self, message: str) -> None:
        try:
            client = Client(Config(
                access_key_id=self.settings.alibaba_cloud_access_key_id,
                access_key_secret=self.settings.alibaba_cloud_access_key_secret,
                region_id=self.settings.aliyun_guard_region,
                endpoint=self.settings.aliyun_guard_endpoint,
                connect_timeout=3000,
                read_timeout=10000,
            ))
            response = client.multi_modal_guard(MultiModalGuardRequest(
                service="query_security_check_pro",
                service_parameters=json.dumps({"content": message}, ensure_ascii=False),
            ))
        except Exception as error:
            # 不把 SDK 异常或请求正文返回给浏览器。
            raise InputGuardUnavailable() from error

        body = response.body
        if response.status_code != 200 or body is None or body.code != 200 or body.data is None:
            raise InputGuardUnavailable()
        suggestion = body.data.suggestion
        if suggestion == "pass":
            return
        if suggestion in {"block", "watch", "mask"}:
            raise InputGuardRejected()
        raise InputGuardUnavailable()
