"""Rebuild the disposable SQLite embedding cache from public chunks.

Run from services/furinabot: uv run python -m app.rebuild_vectors
"""

import json
import sqlite3

from openai import OpenAI

from app.core.config import get_settings
from app.services.retrieval import chunk_hash


def main() -> None:
    settings = get_settings()
    key = settings.embedding_api_key or settings.llm_api_key
    if not key:
        raise RuntimeError("Set EMBEDDING_API_KEY or LLM_API_KEY before rebuilding vectors")
    payload = json.loads((settings.furinafans_content_dir / "chunks.json").read_text(encoding="utf-8"))
    if payload.get("version") != 1:
        raise RuntimeError("Unsupported chunk index version")
    chunks = payload["chunks"]
    settings.furinabot_vector_db.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(settings.furinabot_vector_db) as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS embeddings (chunk_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, model TEXT NOT NULL, vector TEXT NOT NULL)")
        old = {row[0]: (row[1], row[2]) for row in connection.execute("SELECT chunk_id, content_hash, model FROM embeddings")}
        changed = [chunk for chunk in chunks if old.get(chunk["id"]) != (chunk_hash(chunk), settings.embedding_model)]
        with OpenAI(api_key=key, base_url=settings.embedding_base_url or settings.llm_base_url) as client:
            for start in range(0, len(changed), 64):
                batch = changed[start:start + 64]
                response = client.embeddings.create(model=settings.embedding_model, input=[chunk["content"] for chunk in batch])
                ordered = sorted(response.data, key=lambda result: result.index)
                if len(ordered) != len(batch) or [item.index for item in ordered] != list(range(len(batch))):
                    raise RuntimeError("Embedding provider returned an incomplete batch")
                for chunk, item in zip(batch, ordered):
                    connection.execute("INSERT OR REPLACE INTO embeddings VALUES (?, ?, ?, ?)",
                                       (chunk["id"], chunk_hash(chunk), settings.embedding_model, json.dumps(item.embedding)))
        valid_ids = {chunk["id"] for chunk in chunks}
        connection.executemany("DELETE FROM embeddings WHERE chunk_id = ?", [(identifier,) for identifier in old if identifier not in valid_ids])
        connection.commit()
    print(f"Indexed {len(changed)} changed chunks; {len(chunks)} public chunks total")


if __name__ == "__main__":
    main()
