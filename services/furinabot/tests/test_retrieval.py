import asyncio
import json
import sqlite3

from app.schemas.chat import ChatRequest, PageContext
from app.api.chat import get_chat_service
from app.main import app
from app.services.article import ArticleService
from app.services.chat import ChatService, route_request
from app.services.retrieval import RetrievalService, chunk_hash
from fastapi.testclient import TestClient


class NoProvider:
    async def stream(self, message, system_prompt):
        raise AssertionError("No LLM call expected")
        yield ""


def test_routing_and_keyword_retrieval(tmp_path) -> None:
    catalog = [{"id": "r2", "title": "Cloudflare R2", "description": "从 OSS 转向 R2", "tags": ["Cloudflare"], "url": "/posts/r2/"}]
    (tmp_path / "articles.json").write_text(json.dumps({"version": 1, "articles": catalog}), encoding="utf-8")
    (tmp_path / "chunks.json").write_text(json.dumps({"version": 1, "chunks": [
        {"id": "r2#cost-01-01", "articleId": "r2", "title": "Cloudflare R2", "url": "/posts/r2/", "heading": "成本", "content": "OSS 流量成本上升，所以迁移到 R2。", "tags": ["Cloudflare"], "publishedAt": "2026-01-01"},
    ]}), encoding="utf-8")
    retrieval = RetrievalService(tmp_path, tmp_path / "missing.sqlite")

    async def run() -> None:
        hits = await retrieval.search("为什么从 OSS 转向 R2")
        assert [hit.chunk["id"] for hit in hits] == ["r2#cost-01-01"]
        assert hits[0].source()["url"] == "/posts/r2/"
        assert await retrieval.search("Kubernetes") == []
        service = ChatService(NoProvider(), ArticleService(tmp_path), retrieval)
        plan = await service.prepare(ChatRequest(message="结合你以前写的文章，说说为什么从 OSS 转向 R2", context=PageContext(article_id="r2")))
        assert plan.mode == "retrieval"
        assert "OSS 流量成本上升" in plan.prompt
        assert plan.sources[0]["heading"] == "成本"
        missing = await service.prepare(ChatRequest(message="你是不是写过 Kubernetes 系列？"))
        assert missing.mode == "catalog" and missing.direct_answer

    asyncio.run(run())
    assert route_request("总结这篇文章", True) == "current"
    assert route_request("你之前都写过哪些 Cloudflare 相关内容", True) == "catalog"


def test_retrieval_events_include_sources(tmp_path) -> None:
    (tmp_path / "articles.json").write_text(json.dumps({"version": 1, "articles": []}), encoding="utf-8")
    (tmp_path / "chunks.json").write_text(json.dumps({"version": 1, "chunks": [
        {"id": "r2#cache-01-01", "articleId": "r2", "title": "R2 缓存", "url": "/posts/r2/", "heading": "缓存", "content": "Cloudflare Cache Rules", "tags": ["Cloudflare"], "publishedAt": "2026-01-01"},
    ]}), encoding="utf-8")

    class Provider:
        async def stream(self, message, system_prompt):
            yield "见文章"

    app.dependency_overrides[get_chat_service] = lambda: ChatService(
        Provider(), ArticleService(tmp_path), RetrievalService(tmp_path, tmp_path / "none.sqlite")
    )
    try:
        with TestClient(app) as client:
            response = client.post("/api/agent/chat", json={"message": "Cloudflare Cache Rules"})
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.text.index("event: retrieval.start") < response.text.index("event: retrieval.result")
    assert "event: message.sources" in response.text
    assert "/posts/r2/" in response.text


def test_stale_vectors_are_ignored(tmp_path) -> None:
    chunk = {"id": "r2#cache-01-01", "articleId": "r2", "title": "R2", "heading": "缓存", "content": "Cache Rules"}
    database = tmp_path / "vectors.sqlite3"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE embeddings (chunk_id TEXT PRIMARY KEY, content_hash TEXT, model TEXT, vector TEXT)")
        connection.execute("INSERT INTO embeddings VALUES (?, ?, ?, ?)", (chunk["id"], chunk_hash(chunk), "model-a", "[1.0, 0.0]"))
    service = RetrievalService(tmp_path, database)
    assert [hit.chunk["id"] for hit in service._search_stored_vectors([1.0, 0.0], [chunk], "model-a")] == [chunk["id"]]
    assert service._search_stored_vectors([1.0, 0.0], [{**chunk, "content": "changed"}], "model-a") == []
    assert service._search_stored_vectors([1.0, 0.0], [chunk], "model-b") == []
