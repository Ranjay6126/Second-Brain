"""In-memory, SQLite-backed vector index.

Chunk embeddings live in SQLite as float32 blobs and are mirrored into a single
normalised numpy matrix, cached and invalidated whenever the chunk table changes.
That keeps retrieval a single matrix multiply and needs no extra service.
"""

from __future__ import annotations

import threading
from typing import Any

import numpy as np

from . import db

_lock = threading.Lock()
_cache: dict[str, Any] = {"key": None, "matrix": None, "rows": []}

_SELECT = """
SELECT c.item_id, c.idx, c.text, c.embedding, c.dim, c.embed_model,
       i.title, i.kind,
       (i.file_path IS NOT NULL AND i.file_path != '') AS has_file
FROM chunks c
JOIN items i ON i.id = c.item_id
WHERE i.status = 'ready'
ORDER BY c.id
"""


def invalidate() -> None:
    with _lock:
        _cache["key"] = None


def _current_key() -> tuple[int, int]:
    with db.db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c, COALESCE(MAX(id), 0) AS m FROM chunks"
        ).fetchone()
    return int(row["c"]), int(row["m"])


def _load() -> None:
    key = _current_key()
    if _cache["key"] == key:
        return
    with _lock:
        if _cache["key"] == key:
            return
        with db.db() as conn:
            rows = conn.execute(_SELECT).fetchall()
        if rows:
            matrix = np.vstack(
                [np.frombuffer(r["embedding"], dtype=np.float32) for r in rows]
            )
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            matrix = matrix / norms
        else:
            matrix = None
        _cache.update({"key": key, "matrix": matrix, "rows": rows})


def stats() -> dict[str, int]:
    _load()
    matrix = _cache["matrix"]
    return {
        "chunks": len(_cache["rows"]),
        "dim": int(matrix.shape[1]) if matrix is not None else 0,
    }


def search(
    query_vec: list[float] | None,
    top_k: int = 6,
    item_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    if not query_vec:
        return []
    _load()
    matrix: np.ndarray | None = _cache["matrix"]
    rows = _cache["rows"]
    if matrix is None or not rows:
        return []

    query = np.asarray(query_vec, dtype=np.float32)
    if query.shape[0] != matrix.shape[1]:
        return []
    norm = float(np.linalg.norm(query))
    if norm == 0:
        return []
    query = query / norm

    scores = matrix @ query
    order = np.argsort(-scores)[: max(top_k * 6, top_k)]

    allowed = set(item_ids) if item_ids else None
    hits: list[dict[str, Any]] = []
    for position in order:
        row = rows[int(position)]
        if allowed is not None and row["item_id"] not in allowed:
            continue
        hits.append(
            {
                "item_id": row["item_id"],
                "title": row["title"],
                "kind": row["kind"],
                "chunk_idx": int(row["idx"]),
                "text": row["text"],
                "score": round(float(scores[int(position)]), 4),
                "file_url": f"/api/items/{row['item_id']}/file" if row["has_file"] else None,
            }
        )
        if len(hits) >= top_k:
            break
    return hits


def stale_count(model_signature: str) -> int:
    """Chunks embedded with a different model/dimension than the current one."""
    with db.db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM chunks WHERE embed_model != ?", (model_signature,)
        ).fetchone()
    return int(row["c"])
