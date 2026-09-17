import asyncio
import json
from types import SimpleNamespace

import pytest

from app.core.config import Settings
from app.services import input_guard


def test_aliyun_guard_uses_input_service_and_decision(monkeypatch) -> None:
    calls = {}

    class FakeClient:
        def __init__(self, config):
            calls["config"] = config

        def multi_modal_guard(self, request):
            calls["request"] = request
            return SimpleNamespace(
                status_code=200,
                body=SimpleNamespace(code=200, data=SimpleNamespace(suggestion="pass")),
            )

    monkeypatch.setattr(input_guard, "Client", FakeClient)
    settings = Settings(
        _env_file=None,
        alibaba_cloud_access_key_id="test-id",
        alibaba_cloud_access_key_secret="test-secret",
    )
    asyncio.run(input_guard.AliyunInputGuard(settings).check("你好"))

    assert calls["request"].service == "query_security_check_pro"
    assert json.loads(calls["request"].service_parameters) == {"content": "你好"}
    assert calls["config"].endpoint == "green-cip.cn-shanghai.aliyuncs.com"


@pytest.mark.parametrize("suggestion", ["block", "watch", "mask"])
def test_aliyun_guard_rejects_non_pass_suggestions(monkeypatch, suggestion) -> None:
    class FakeClient:
        def __init__(self, config):
            pass

        def multi_modal_guard(self, request):
            return SimpleNamespace(
                status_code=200,
                body=SimpleNamespace(code=200, data=SimpleNamespace(suggestion=suggestion)),
            )

    monkeypatch.setattr(input_guard, "Client", FakeClient)
    settings = Settings(
        _env_file=None,
        alibaba_cloud_access_key_id="test-id",
        alibaba_cloud_access_key_secret="test-secret",
    )
    with pytest.raises(input_guard.InputGuardRejected):
        asyncio.run(input_guard.AliyunInputGuard(settings).check("你好"))


def test_aliyun_guard_rejects_overlong_input_before_sdk(monkeypatch) -> None:
    monkeypatch.setattr(input_guard, "Client", lambda config: pytest.fail("SDK must not be called"))
    settings = Settings(_env_file=None)
    with pytest.raises(input_guard.InputGuardTooLong):
        asyncio.run(input_guard.AliyunInputGuard(settings).check("a" * 2001))
