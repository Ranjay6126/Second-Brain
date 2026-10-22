"""Ingestion pipeline: file -> text -> chunks -> embeddings."""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any

from . import db, llm, vector
from .chunking import chunk_text, clean_text
from .config import UPLOAD_DIR

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".heic", ".heif", ".tiff"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus", ".aiff", ".wma"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".mpeg", ".mpg", ".3gp"}
PDF_EXT = {".pdf"}
TEXT_EXT = {
    ".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".log", ".rst",
    ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".sql", ".sh", ".env", ".toml",
}

_KIND_BY_EXT = {
    **{e: "image" for e in IMAGE_EXT},
    **{e: "audio" for e in AUDIO_EXT},
    **{e: "video" for e in VIDEO_EXT},
    **{e: "pdf" for e in PDF_EXT},
    **{e: "text" for e in TEXT_EXT},
}


def detect_kind(filename: str, content_type: str | None) -> str:
    ext = Path(filename).suffix.lower()
    if ext in _KIND_BY_EXT:
        return _KIND_BY_EXT[ext]
    mime = (content_type or mimetypes.guess_type(filename)[0] or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("video/"):
        return "video"
    if mime == "application/pdf":
        return "pdf"
    return "text"


def _read_text_file(path: Path) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return path.read_text(encoding=encoding)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return path.read_bytes().decode("utf-8", errors="ignore")


def _extract_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages: list[str] = []
    for page in reader.pages[:300]:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001 - malformed page, keep going
            continue
    return "\n\n".join(pages)


def _summarise(text: str) -> str:
    flat = " ".join(text.split())
    if len(flat) <= 320:
        return flat
    return flat[:320].rsplit(" ", 1)[0] + "…"


def build_content(row: Any) -> tuple[str, str]:
    """Return (indexable_content, summary) for an item row."""
    kind = row["kind"]
    note = (row["note"] or "").strip()
    source = row["source"] or row["title"]
    file_path = UPLOAD_DIR / row["file_path"] if row["file_path"] else None

    extracted = ""

    if kind == "text":
        if file_path and file_path.exists():
            extracted = _read_text_file(file_path)
        else:
            extracted = row["content"] or ""

    elif kind == "pdf":
        if file_path and file_path.exists():
            try:
                extracted = _extract_pdf(file_path)
            except Exception as exc:  # noqa: BLE001
                extracted = ""
            if len(clean_text(extracted)) < 200:
                # Scanned / image-only PDF -> let Gemini read the document.
                extracted = llm.describe_media(file_path, "pdf")

    else:  # image | audio | video
        if llm.is_gemini() and file_path and file_path.exists():
            extracted = llm.describe_media(file_path, kind)
        else:
            # Local mode: index whatever the user told us about the file.
            descriptor = f"{source} — {kind} file ({Path(source).suffix.lstrip('.') or 'unknown'} format)"
            extracted = descriptor

    parts = [p for p in (f"# {row['title']}", note, extracted) if p and p.strip()]
    content = clean_text("\n\n".join(parts))
    return content, _summarise(content or note or source)


def process_item(item_id: str) -> None:
    row = db.get_item_row(item_id)
    if row is None:
        return
    db.update_item(item_id, status="processing", error=None)
    try:
        content, summary = build_content(row)
        if not content.strip():
            raise ValueError(
                "Nothing indexable was found. Add a context note, or configure "
                "GEMINI_API_KEY so media files can be read."
            )
        chunks = chunk_text(content)
        if not chunks:
            raise ValueError("No text could be extracted from this item.")
        vectors, signature = llm.embed_documents(chunks)
        db.replace_chunks(item_id, chunks, vectors, signature)
        db.update_item(item_id, content=content, summary=summary, status="ready", error=None)
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI as `error`
        db.update_item(item_id, status="failed", error=str(exc)[:600])
    finally:
        vector.invalidate()
