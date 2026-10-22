"""LLM access layer.

Two modes:
  * ``gemini`` — full multimodal understanding via the Google Gen AI SDK
    (vision for images, native audio/video understanding, document understanding).
  * ``local``  — no API key configured. Text/PDF still get semantic-ish
    embeddings from a local hashing vectorizer and answers are extractive.
"""

from __future__ import annotations

import hashlib
import re
import time
from pathlib import Path
from typing import Any, Iterator, Sequence

import numpy as np

from .config import (
    CHAT_MODEL,
    EMBED_DIM,
    EMBED_MODEL,
    GEMINI_API_KEY,
    MEDIA_MODEL,
    llm_mode,
)

_TOKEN_RE = re.compile(r"[a-z0-9']+")
_EMBED_BATCH = 48

SYSTEM_PROMPT = (
    "You are Second Brain, the user's personal knowledge assistant. "
    "You answer strictly from the CONTEXT passages retrieved from the user's own saved notes, "
    "documents, images, audio and video. "
    "Rules: (1) Ground every claim in the context and cite it inline with bracketed numbers like [1] "
    "matching the context markers. (2) If the context does not contain the answer, say so plainly and "
    "suggest what the user could save to help. (3) Never invent file names, numbers or facts. "
    "(4) Prefer concise, well-structured markdown: short paragraphs, bullet lists, and bold key terms. "
    "(5) When sources are images/audio/video, make clear that the detail comes from an AI description "
    "or transcript of that file."
)

MEDIA_PROMPTS: dict[str, str] = {
    "image": (
        "You are indexing this image into a personal knowledge base. Produce plain markdown with:\n"
        "## Description\nA detailed, factual description of everything visible (objects, people, setting, style).\n"
        "## Text in image\nEvery piece of visible text transcribed verbatim (OCR). Write 'none' if there is none.\n"
        "## Key points\n3-6 bullets capturing information someone might later search for.\n"
        "Do not speculate about things that are not visible."
    ),
    "audio": (
        "You are indexing this audio recording into a personal knowledge base. Produce plain markdown with:\n"
        "## Transcript\nA faithful transcript (speaker labels like 'Speaker 1:' when you can distinguish them).\n"
        "## Summary\nA short paragraph summarising what was said.\n"
        "## Key points\n3-8 bullets of decisions, names, numbers, tasks and topics worth searching for."
    ),
    "video": (
        "You are indexing this video into a personal knowledge base. Produce plain markdown with:\n"
        "## Overview\nWhat happens in the video, in order, scene by scene.\n"
        "## Transcript\nA faithful transcript of all speech and on-screen text.\n"
        "## Key points\n3-8 bullets of facts, names, numbers and topics worth searching for."
    ),
    "pdf": (
        "You are indexing this document into a personal knowledge base. Extract ALL of its text content, "
        "preserving headings, lists and tables as markdown. Do not summarise - reproduce the information "
        "faithfully and completely."
    ),
}

_CLIENT: Any = None
_CLIENT_ERROR: str | None = None


def is_gemini() -> bool:
    return llm_mode() == "gemini"


def _client() -> Any:
    global _CLIENT, _CLIENT_ERROR
    if _CLIENT is None:
        try:
            from google import genai

            _CLIENT = genai.Client(api_key=GEMINI_API_KEY)
            _CLIENT_ERROR = None
        except Exception as exc:  # pragma: no cover - configuration problem
            _CLIENT_ERROR = str(exc)
            raise RuntimeError(f"Could not initialise the Gemini client: {exc}") from exc
    return _CLIENT


def _retry(fn, attempts: int = 3, base_delay: float = 1.5):
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - SDK raises many types
            last = exc
            if attempt == attempts - 1:
                break
            time.sleep(base_delay * (2**attempt))
    assert last is not None
    raise last


# ------------------------------------------------------------------ local embeddings


def local_embed(text: str, dim: int = EMBED_DIM) -> list[float]:
    """Deterministic hashing vectorizer over word unigrams + bigrams."""
    vec = np.zeros(dim, dtype=np.float32)
    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        return vec.tolist()
    grams: list[str] = list(tokens)
    grams.extend(f"{a}_{b}" for a, b in zip(tokens, tokens[1:]))
    for gram in grams:
        digest = hashlib.blake2b(gram.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] & 1 else -1.0
        vec[idx] += sign
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec /= norm
    return vec.tolist()


def local_embed_many(texts: Sequence[str]) -> list[list[float]]:
    return [local_embed(t) for t in texts]


# ------------------------------------------------------------------ embeddings


def embed(texts: Sequence[str], task_type: str) -> tuple[list[list[float]], str]:
    """Embed texts. Returns (vectors, model_signature) where the signature
    encodes both model and dimension so stale vectors are never compared."""

    texts = [t for t in texts if t and t.strip()]
    if not texts:
        return [], _model_signature(EMBED_DIM) if is_gemini() else f"local-hash-{EMBED_DIM}"

    if not is_gemini():
        return local_embed_many(texts), f"local-hash-{EMBED_DIM}"

    from google.genai import types

    client = _client()
    vectors: list[list[float]] = []
    dim = EMBED_DIM

    for start in range(0, len(texts), _EMBED_BATCH):
        batch = texts[start : start + _EMBED_BATCH]

        def call(batch: list[str] = batch):
            return client.models.embed_content(
                model=EMBED_MODEL,
                contents=batch,
                config=types.EmbedContentConfig(
                    task_type=task_type, output_dimensionality=EMBED_DIM
                ),
            )

        try:
            response = _retry(call)
        except Exception:
            # Older embedding models reject output_dimensionality.
            def call_plain(batch: list[str] = batch):
                return client.models.embed_content(
                    model=EMBED_MODEL,
                    contents=batch,
                    config=types.EmbedContentConfig(task_type=task_type),
                )

            response = _retry(call_plain)

        for embedding in response.embeddings:
            values = list(embedding.values)
            dim = len(values)
            vectors.append(values)

    if len(vectors) != len(texts):
        raise RuntimeError(
            f"Embedding model returned {len(vectors)} vectors for {len(texts)} inputs."
        )
    return vectors, _model_signature(dim)


def _model_signature(dim: int) -> str:
    return f"{EMBED_MODEL}:{dim}"


def embed_documents(texts: Sequence[str]) -> tuple[list[list[float]], str]:
    return embed(texts, "RETRIEVAL_DOCUMENT")


def embed_query(text: str) -> tuple[list[float], str]:
    vectors, signature = embed([text], "RETRIEVAL_QUERY")
    if not vectors:
        fallback = local_embed(text, EMBED_DIM) if not is_gemini() else []
        return fallback, signature
    return vectors[0], signature


# ------------------------------------------------------------------ media understanding


def _file_state(file_obj: Any) -> str:
    state = getattr(file_obj, "state", None)
    name = getattr(state, "name", None)
    if isinstance(name, str):
        return name.upper()
    return str(state or "").upper()


def describe_media(path: Path, kind: str) -> str:
    """Upload a PDF/image/audio/video to Gemini and return a full text rendition."""
    if not is_gemini():
        raise RuntimeError(
            "Media understanding needs a GEMINI_API_KEY. Add one to backend/.env, "
            "or write a context note with the file so it stays searchable."
        )

    client = _client()
    uploaded = _retry(lambda: client.files.upload(file=str(path)))
    try:
        deadline = time.time() + 300
        while "PROCESSING" in _file_state(uploaded) and time.time() < deadline:
            time.sleep(2.5)
            uploaded = client.files.get(name=uploaded.name)
        if "FAILED" in _file_state(uploaded):
            raise RuntimeError("Gemini could not process this file.")

        prompt = MEDIA_PROMPTS.get(kind, MEDIA_PROMPTS["pdf"])

        def call():
            return client.models.generate_content(
                model=MEDIA_MODEL, contents=[uploaded, prompt]
            )

        response = _retry(call)
        text = (getattr(response, "text", "") or "").strip()
        if not text:
            raise RuntimeError("Gemini returned an empty description for this file.")
        return text
    finally:
        try:
            client.files.delete(name=uploaded.name)
        except Exception:  # noqa: BLE001 - best-effort cleanup
            pass


# ------------------------------------------------------------------ answering


def _format_contexts(contexts: list[dict[str, Any]]) -> str:
    blocks = []
    for ctx in contexts:
        header = f"[{ctx['n']}] ({ctx['kind']}) {ctx['title']}"
        blocks.append(f"{header}\n{ctx['text']}")
    return "\n\n---\n\n".join(blocks)


def _build_prompt(question: str, contexts: list[dict[str, Any]], history: list[dict[str, str]]) -> str:
    parts: list[str] = []
    if history:
        transcript = "\n".join(
            f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content'][:600]}"
            for m in history
        )
        parts.append(f"## Recent conversation\n{transcript}")
    parts.append(f"## Context passages from the user's Second Brain\n{_format_contexts(contexts)}")
    parts.append(f"## User question\n{question}")
    return "\n\n".join(parts)


def answer_stream(
    question: str,
    contexts: list[dict[str, Any]],
    history: list[dict[str, str]] | None = None,
) -> Iterator[str]:
    if not is_gemini():
        yield _local_answer(question, contexts)
        return

    from google.genai import types

    client = _client()
    prompt = _build_prompt(question, contexts, history or [])

    def call():
        return client.models.generate_content_stream(
            model=CHAT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.25,
                max_output_tokens=2048,
            ),
        )

    stream = _retry(call)
    for chunk in stream:
        text = getattr(chunk, "text", None)
        if text:
            yield text


def _local_answer(question: str, contexts: list[dict[str, Any]]) -> str:
    lines = [
        "**Local mode** — no `GEMINI_API_KEY` is configured, so I can't write a synthesised answer. "
        "Here are the most relevant passages I found in your brain:",
        "",
    ]
    for ctx in contexts[:4]:
        snippet = " ".join(ctx["text"].split())
        if len(snippet) > 420:
            snippet = snippet[:420].rsplit(" ", 1)[0] + "…"
        lines.append(f"**[{ctx['n']}] {ctx['title']}** _({ctx['kind']})_")
        lines.append(f"> {snippet}")
        lines.append("")
    lines.append("_Add a Gemini API key in `backend/.env` and restart the server for full answers._")
    return "\n".join(lines)


def unavailable_reason() -> str | None:
    if is_gemini() and _CLIENT_ERROR:
        return _CLIENT_ERROR
    return None
