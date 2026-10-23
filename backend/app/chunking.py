from __future__ import annotations

import re
from typing import Any

from .config import CHUNK_OVERLAP, CHUNK_SIZE

_WS = re.compile(r"[ \t]+")
_BLANKS = re.compile(r"\n{3,}")


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _WS.sub(" ", text)
    text = "\n".join(line.strip() for line in text.split("\n"))
    return _BLANKS.sub("\n\n", text).strip()


def _split_paragraphs(text: str) -> list[str]:
    parts = [p.strip() for p in re.split(r"\n\s*\n", text)]
    return [p for p in parts if p]


def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks, preferring paragraph boundaries."""
    text = clean_text(text)
    if not text:
        return []

    chunks: list[str] = []
    buffer = ""

    for para in _split_paragraphs(text):
        # A single oversized paragraph (e.g. a transcript) is hard-wrapped.
        if len(para) > size:
            if buffer:
                chunks.append(buffer)
                buffer = ""
            start = 0
            while start < len(para):
                end = min(start + size, len(para))
                if end < len(para):
                    cut = para.rfind(" ", start + size // 2, end)
                    if cut > 0:
                        end = cut
                chunks.append(para[start:end].strip())
                if end >= len(para):
                    break
                start = max(end - overlap, start + 1)
            continue

        candidate = f"{buffer}\n\n{para}" if buffer else para
        if len(candidate) <= size:
            buffer = candidate
            continue

        chunks.append(buffer)
        tail = buffer[-overlap:] if overlap > 0 else ""
        buffer = f"{tail}\n\n{para}".strip() if tail else para

    if buffer.strip():
        chunks.append(buffer.strip())

    return [c for c in chunks if c.strip()]


def chunk_segments(
    segments: list[tuple[str, dict[str, Any]]],
    size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[tuple[str, dict[str, Any]]]:
    """Chunk labelled segments (PDF pages, timestamped transcript blocks ...).

    Each segment keeps its own label so a retrieved chunk can always be traced
    back to the page or timestamp it came from. Segments are never merged, which
    keeps citations exact at the cost of occasionally smaller chunks.
    """
    out: list[tuple[str, dict[str, Any]]] = []
    for text, meta in segments:
        for piece in chunk_text(text, size=size, overlap=overlap):
            out.append((piece, dict(meta or {})))
    return out
