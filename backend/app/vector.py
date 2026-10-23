"""SQLite-backed hybrid index.

Chunk embeddings live in SQLite as float32 blobs and are mirrored into a single
normalised numpy matrix, cached and invalidated whenever the chunk table changes.
That keeps the semantic side a single matrix multiply and needs no extra service.

On top of the vector score we add a BM25 keyword score computed from an inverted
index built at the same time, so exact terms (names, serial numbers, error codes)
are never lost to embedding noise.
"""

from __future__ import annotations

import math
import re
import threading
from collections import Counter, defaultdict
from typing import Any

import numpy as np

from . import db

_lock = threading.Lock()
_cache: dict[str, Any] = {
    "key": None,
    "matrix": None,
    "rows": [],
    "postings": {},
    "doc_len": [],
    "avg_len": 1.0,
}

_TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9'._-]*")

# Blend weights: semantic similarity dominates, keyword matching breaks ties.
_VECTOR_WEIGHT = 0.65
_KEYWORD_WEIGHT = 0.35
_PHRASE_BONUS = 0.12

# A chunk is only returned when it shares at least one meaningful word with the
# question, or when its cosine similarity is high enough to stand on its own.
# Without a gate, min-max normalisation would make every question "match" the
# single best chunk and the honest no-answer path would never be reachable.
_MIN_VECTOR_SIM = 0.30
_MIN_SCORE = 0.05

_STOPWORDS = frozenset(
    """
    a about above after again against all am an and any are as at be because been
    before being below between both but by can cannot could did do does doing down
    during each few for from further had has have having he her here hers herself
    him himself his how i if in into is it its itself me more most my myself no nor
    not of off on once only or other ought our ours ourselves out over own same she
    should so some such than that the their theirs them themselves then there these
    they this those through to too under until up very was we were what when where
    which while who whom why with would you your yours yourself yourselves tell
    explain describe give show list summarise summarize me please
    """.split()
)

_SELECT = """
SELECT c.item_id, c.idx, c.text, c.embedding, c.dim, c.embed_model, c.meta,
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


def _normalise(token: str) -> str:
    """Cheap singular form so 'qualifications' still matches 'qualification'."""
    if len(token) > 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _tokenize(text: str) -> list[str]:
    return [_normalise(t) for t in _TOKEN_RE.findall(text.lower())]


def _content_tokens(text: str) -> list[str]:
    """Tokens a question must share with a chunk to count as a real match."""
    return [t for t in _tokenize(text) if t and t not in _STOPWORDS]



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
            # Changing the embedding model leaves chunks of several dimensions in
            # the table. Only the dominant dimension can form one matrix; the
            # rest are ignored until their items are reprocessed, which is what
            # `/api/items/{id}/reprocess` is for.
            dominant = Counter(row["dim"] for row in rows).most_common(1)[0][0]
            rows = [row for row in rows if row["dim"] == dominant]

        if rows:
            matrix = np.vstack(
                [np.frombuffer(r["embedding"], dtype=np.float32) for r in rows]
            )
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            matrix = matrix / norms
        else:
            matrix = None

        postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
        doc_len: list[int] = []
        for position, row in enumerate(rows):
            tokens = _tokenize(row["text"])
            doc_len.append(len(tokens) or 1)
            for term, count in Counter(tokens).items():
                postings[term].append((position, count))

        avg_len = float(np.mean(doc_len)) if doc_len else 1.0
        _cache.update(
            {
                "key": key,
                "matrix": matrix,
                "rows": rows,
                "postings": dict(postings),
                "doc_len": doc_len,
                "avg_len": avg_len or 1.0,
            }
        )


def _bm25(query_tokens: list[str]) -> np.ndarray | None:
    postings: dict[str, list[tuple[int, int]]] = _cache["postings"]
    if not postings:
        return None
    count = len(_cache["rows"])
    doc_len = _cache["doc_len"]
    avg_len = _cache["avg_len"] or 1.0
    scores = np.zeros(count, dtype=np.float32)
    k1, b = 1.5, 0.75

    for term in set(query_tokens):
        entries = postings.get(term)
        if not entries:
            continue
        idf = math.log(1 + (count - len(entries) + 0.5) / (len(entries) + 0.5))
        for position, frequency in entries:
            denominator = frequency + k1 * (1 - b + b * doc_len[position] / avg_len)
            scores[position] += idf * (frequency * (k1 + 1)) / denominator
    return scores


def _minmax(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    low = float(values.min())
    high = float(values.max())
    if high - low < 1e-9:
        return np.zeros_like(values)
    return (values - low) / (high - low)


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
    query_text: str | None = None,
    strict: bool = False,
) -> list[dict[str, Any]]:
    """Rank chunks for a question.

    ``strict`` additionally requires every returned chunk to share a meaningful
    word with the question (or to match it verbatim). That is what makes the
    offline extractive answer honest: with no model to judge relevance, an
    unrelated question must come back empty rather than quoting a document that
    happens to be the least dissimilar one.
    """
    _load()
    matrix: np.ndarray | None = _cache["matrix"]
    rows = _cache["rows"]
    if not rows:
        return []

    vector_scores: np.ndarray | None = None
    if query_vec and matrix is not None:
        query = np.asarray(query_vec, dtype=np.float32)
        if query.shape[0] == matrix.shape[1]:
            norm = float(np.linalg.norm(query))
            if norm > 0:
                vector_scores = matrix @ (query / norm)

    keyword_scores = _bm25(_content_tokens(query_text)) if query_text else None

    if vector_scores is None and keyword_scores is None:
        return []
    if vector_scores is None:
        combined = _minmax(keyword_scores)
    elif keyword_scores is None:
        combined = _minmax(vector_scores)
    else:
        combined = _VECTOR_WEIGHT * _minmax(vector_scores) + _KEYWORD_WEIGHT * _minmax(
            keyword_scores
        )

    count = len(rows)

    if query_text:
        needle = " ".join(query_text.lower().split())
    else:
        needle = ""
    phrase_mask = np.zeros(count, dtype=bool)
    if len(needle) >= 4:
        phrase_mask = np.array(
            [needle in row["text"].lower() for row in rows], dtype=bool
        )
        combined = combined + _PHRASE_BONUS * phrase_mask.astype(np.float32)

    # Relevance gate. In strict mode a chunk has to earn its place: either the
    # raw cosine is strong, or it shares a meaningful word with the question, or
    # the question appears in it verbatim. Everything else is dropped so an
    # unrelated question honestly reports that the sources contain no answer.
    if strict:
        gate = phrase_mask.copy()
        if vector_scores is not None:
            gate |= np.asarray(vector_scores) >= _MIN_VECTOR_SIM
        if keyword_scores is not None:
            gate |= np.asarray(keyword_scores) > 0
        combined = np.where(gate, np.maximum(combined, _MIN_SCORE), 0.0)
    else:
        # Non-strict: this is ordinary top-k retrieval for a model that can
        # judge the passages itself, so nothing is filtered out by relevance.
        combined = np.maximum(combined, _MIN_SCORE)

    allowed = set(item_ids) if item_ids else None
    order = np.argsort(-combined)
    hits: list[dict[str, Any]] = []
    for position in order:
        row = rows[int(position)]
        if allowed is not None and row["item_id"] not in allowed:
            continue
        score = float(combined[int(position)])
        if score <= 0:
            # Nothing matched at all: stop rather than returning noise.
            break
        hits.append(
            {
                "item_id": row["item_id"],
                "title": row["title"],
                "kind": row["kind"],
                "chunk_idx": int(row["idx"]),
                "text": row["text"],
                "score": round(score, 4),
                "meta": db._loads(row["meta"]),
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
