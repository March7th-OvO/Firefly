import asyncio
import hashlib
import json
import logging
import math
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from openai import AsyncOpenAI

from app.core.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class SearchHit:
    chunk: dict
    score: float

    def source(self) -> dict:
        return {key: self.chunk[key] for key in ("id", "articleId", "title", "url", "heading")}


def tokens(text: str) -> set[str]:
    lower = text.casefold()
    latin = re.findall(r"[a-z0-9][a-z0-9.+-]*", lower)
    han = re.findall(r"[\u3400-\u9fff]+", lower)
    return set(latin + [word[i:i + 2] for word in han for i in range(max(0, len(word) - 1))])


def cosine(left: list[float], right: list[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    product = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left) * sum(b * b for b in right))
    return product / norm if norm else 0.0


class RetrievalService:
    """Hybrid retrieval over derived chunks; SQLite vectors are disposable cache."""

    def __init__(self, content_dir: Path, vector_db: Path, settings: Settings | None = None) -> None:
        self.content_dir = content_dir
        self.vector_db = vector_db
        self.settings = settings

    async def chunks(self) -> list[dict]:
        try:
            data = json.loads((self.content_dir / "chunks.json").read_text(encoding="utf-8"))
            return data["chunks"] if data.get("version") == 1 and isinstance(data.get("chunks"), list) else []
        except (OSError, ValueError, TypeError):
            return []

    async def keyword_search(self, query: str, chunks: list[dict] | None = None) -> list[SearchHit]:
        chunks = await self.chunks() if chunks is None else chunks
        terms = tokens(query)
        if not terms:
            return []
        hits = []
        for chunk in chunks:
            title = tokens(str(chunk.get("title", "")))
            heading = tokens(str(chunk.get("heading", "")))
            tags = tokens(" ".join(chunk.get("tags", [])))
            body = tokens(str(chunk.get("content", "")))
            score = sum(4 if term in title else 3 if term in tags else 2 if term in heading else 1 if term in body else 0 for term in terms)
            if score:
                hits.append(SearchHit(chunk, float(score)))
        return sorted(hits, key=lambda hit: (-hit.score, hit.chunk["id"]))

    async def vector_search(self, query: str, chunks: list[dict]) -> list[SearchHit]:
        settings = self.settings
        key = (settings.embedding_api_key or settings.llm_api_key) if settings else ""
        if not key or not self.vector_db.exists() or not chunks:
            return []
        try:
            async with AsyncOpenAI(api_key=key, base_url=settings.embedding_base_url or settings.llm_base_url) as client:
                response = await client.embeddings.create(model=settings.embedding_model, input=query)
            query_vector = response.data[0].embedding
            # SQLite reads are offloaded so the streaming API event loop stays responsive.
            return await asyncio.to_thread(self._search_stored_vectors, query_vector, chunks, settings.embedding_model)
        except Exception:
            # Missing/stale vector data or embedding outages degrade to keyword search.
            logger.warning("Vector retrieval unavailable; using keyword search", exc_info=True)
            return []

    def _search_stored_vectors(self, query_vector: list[float], chunks: list[dict], model: str) -> list[SearchHit]:
        by_id = {chunk["id"]: chunk for chunk in chunks}
        hits = []
        with sqlite3.connect(self.vector_db) as connection:
            for chunk_id, digest, stored_model, vector_json in connection.execute("SELECT chunk_id, content_hash, model, vector FROM embeddings"):
                chunk = by_id.get(chunk_id)
                if not chunk or stored_model != model or digest != chunk_hash(chunk):
                    continue
                score = cosine(query_vector, json.loads(vector_json))
                if score >= 0.25:
                    hits.append(SearchHit(chunk, score))
        return sorted(hits, key=lambda hit: (-hit.score, hit.chunk["id"]))

    async def search(self, query: str, limit: int = 5) -> list[SearchHit]:
        chunks = await self.chunks()
        keyword, vector = await asyncio.gather(
            self.keyword_search(query, chunks), self.vector_search(query, chunks)
        )
        if not keyword and not vector:
            return []
        # Reciprocal rank fusion combines two score scales without assuming they match.
        fused: dict[str, tuple[dict, float]] = {}
        for results, weight in ((keyword, 1.0), (vector, 1.0)):
            for rank, hit in enumerate(results[:30]):
                identifier = hit.chunk["id"]
                old = fused.get(identifier)
                fused[identifier] = (hit.chunk, (old[1] if old else 0.0) + weight / (60 + rank + 1))
        terms = tokens(query)
        ranked = []
        for chunk, score in fused.values():
            # Lightweight rerank rewards coverage and explicit metadata matches.
            title_terms = tokens(f'{chunk.get("title", "")} {chunk.get("heading", "")} {" ".join(chunk.get("tags", []))}')
            coverage = len(terms & tokens(str(chunk.get("content", "")))) / max(len(terms), 1)
            metadata = len(terms & title_terms) / max(len(terms), 1)
            ranked.append(SearchHit(chunk, score + 0.02 * coverage + 0.03 * metadata))
        ranked.sort(key=lambda hit: (-hit.score, hit.chunk["id"]))
        selected: list[SearchHit] = []
        article_counts: dict[str, int] = {}
        for hit in ranked:
            article_id = hit.chunk["articleId"]
            if article_counts.get(article_id, 0) >= 2:
                continue
            selected.append(hit)
            article_counts[article_id] = article_counts.get(article_id, 0) + 1
            if len(selected) >= limit:
                break
        return selected


def chunk_hash(chunk: dict) -> str:
    material = f'{chunk.get("title", "")}\n{chunk.get("heading", "")}\n{chunk.get("content", "")}'
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
