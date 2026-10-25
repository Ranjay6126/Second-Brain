"""Ingestion pipeline: file -> labelled segments -> chunks -> embeddings.

Every chunk carries a small metadata label (PDF page, audio/video timestamp,
image metadata block) so retrieved evidence can be cited precisely.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any

from . import db, llm, vector
from .chunking import chunk_segments, clean_text
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

SUPPORTED_EXTENSIONS = sorted(_KIND_BY_EXT)

_TEXT_MIME_HINTS = (
    "text/",
    "application/json",
    "application/xml",
    "application/x-yaml",
    "application/yaml",
    "application/x-sh",
    "application/toml",
)


def is_supported(filename: str, content_type: str | None = None) -> bool:
    """Reject binaries we could only index as garbage."""
    if Path(filename).suffix.lower() in _KIND_BY_EXT:
        return True
    mime = (content_type or mimetypes.guess_type(filename)[0] or "").lower()
    if mime.startswith(("image/", "audio/", "video/")) or mime == "application/pdf":
        return True
    return any(mime.startswith(hint) for hint in _TEXT_MIME_HINTS)


def detect_kind(filename: str, content_type: str | None = None) -> str:
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


def _summarise(text: str) -> str:
    flat = " ".join(text.split())
    if len(flat) <= 320:
        return flat
    return flat[:320].rsplit(" ", 1)[0] + "…"


# ----------------------------------------------------------------------- PDF


def _pdf_segments(path: Path) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    """One labelled segment per page, so answers can cite the exact page."""
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    segments: list[tuple[str, dict[str, Any]]] = []
    empty_pages: list[int] = []

    for number, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:  # noqa: BLE001 - a single bad page must not kill the file
            text = ""
        if text.strip():
            segments.append((text, {"page": number}))
        else:
            empty_pages.append(number)

    meta: dict[str, Any] = {
        "pages": len(reader.pages),
        "pages_without_text": empty_pages,
        "extraction": "text",
    }
    try:
        info = reader.metadata
        if info:
            meta["document"] = {
                str(key).lstrip("/"): str(value)
                for key, value in info.items()
                if value not in (None, "")
            }
    except Exception:  # noqa: BLE001 - metadata is optional
        pass
    return segments, meta


# --------------------------------------------------------------------- images


def _gps_to_decimal(values: Any, ref: Any) -> float | None:
    try:
        degrees, minutes, seconds = (float(part) for part in values)
    except (TypeError, ValueError):
        return None
    decimal = degrees + minutes / 60 + seconds / 3600
    if str(ref).upper() in ("S", "W"):
        decimal = -decimal
    return round(decimal, 6)


def _image_metadata(path: Path) -> tuple[str, dict[str, Any]]:
    """Read EXIF with Pillow. Never guesses: missing tags are reported as
    'not recorded' and unreadable EXIF is reported as 'unavailable'."""
    meta: dict[str, Any] = {"extraction": "metadata"}
    lines = ["## Image metadata"]

    try:
        from PIL import Image, ExifTags
    except ImportError:
        lines.append("- Metadata: unavailable (Pillow is not installed)")
        meta["metadata"] = "unavailable"
        return "\n".join(lines), meta

    try:
        with Image.open(path) as image:
            width, height = image.size
            meta.update(
                {
                    "width": width,
                    "height": height,
                    "format": image.format,
                    "mode": image.mode,
                }
            )
            lines.append(f"- Dimensions: {width} x {height} px")
            if image.format:
                lines.append(f"- Format: {image.format}")
            exif = image.getexif()
            exif_items = dict(exif) if exif else {}
    except Exception as exc:  # noqa: BLE001
        lines.append(f"- Metadata: unavailable (could not read the file: {exc})")
        meta["metadata"] = "unavailable"
        return "\n".join(lines), meta

    if not exif_items:
        lines.append("- Camera metadata: not recorded in this file")
        meta["metadata"] = "not_recorded"
        return "\n".join(lines), meta

    decoded: dict[str, Any] = {}
    for tag_id, value in exif_items.items():
        name = ExifTags.TAGS.get(tag_id, str(tag_id))
        if isinstance(value, bytes):
            value = value.decode("utf-8", "ignore").strip("\x00") or None
        if value not in (None, ""):
            decoded[name] = value

    meta["metadata"] = "present"
    if "Make" in decoded or "Model" in decoded:
        device = " ".join(str(decoded.get(k, "")).strip() for k in ("Make", "Model")).strip()
        lines.append(f"- Camera: {device}")
        meta["camera"] = device
    if "DateTimeOriginal" in decoded or "DateTime" in decoded:
        captured = decoded.get("DateTimeOriginal") or decoded.get("DateTime")
        lines.append(f"- Captured: {captured}")
        meta["captured_at"] = str(captured)
    if "Software" in decoded:
        lines.append(f"- Software: {decoded['Software']}")
    if "Orientation" in decoded:
        lines.append(f"- Orientation: {decoded['Orientation']}")

    gps: dict[str, Any] = {}
    try:
        gps = dict(exif.get_ifd(0x8825)) or {}
    except Exception:  # noqa: BLE001
        gps = {}
    if gps:
        latitude = _gps_to_decimal(gps.get(2), gps.get(1))
        longitude = _gps_to_decimal(gps.get(4), gps.get(3))
        if latitude is not None and longitude is not None:
            lines.append(f"- GPS: {latitude}, {longitude}")
            meta["gps"] = {"lat": latitude, "lon": longitude}
    if "gps" not in meta:
        lines.append("- GPS: not recorded in this file")

    for label, key in (("Lens", "LensModel"), ("Exposure", "ExposureTime"), ("ISO", "ISOSpeedRatings")):
        if key in decoded:
            lines.append(f"- {label}: {decoded[key]}")

    return "\n".join(lines), meta


def _image_segments(
    path: Path, title: str, source: str
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    metadata_text, meta = _image_metadata(path)
    segments: list[tuple[str, dict[str, Any]]] = [(metadata_text, {"section": "metadata"})]

    described = False
    if llm.can_describe("image"):
        try:
            segments.extend(llm.media_segments(path, "image"))
            meta["extraction"] = "metadata+vision"
            described = True
        except Exception as exc:  # noqa: BLE001 - metadata alone is still useful
            meta["vision_error"] = str(exc)[:300]
    else:
        meta["vision_error"] = llm.media_hint("image")

    if not described and meta.get("metadata") == "unavailable":
        # The file could not even be opened, and nothing can describe it: this
        # is a corrupted image rather than a valid one with missing EXIF.
        raise ValueError(
            f"'{source}' could not be read as an image. It may be corrupted or "
            "only partially uploaded. " + llm.media_hint("image")
        )

    if len(segments) == 1:
        segments.append(
            (f"{source} - image file ({title}). {llm.media_hint('image')}", {})
        )
    return segments, meta


# ------------------------------------------------------------------ segments


def build_segments(row: Any) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any]]:
    """Return (labelled_segments, item_metadata) for an item row."""
    kind = row["kind"]
    note = (row["note"] or "").strip()
    source = row["source"] or row["title"]
    file_path = UPLOAD_DIR / row["file_path"] if row["file_path"] else None
    item_meta: dict[str, Any] = {}

    segments: list[tuple[str, dict[str, Any]]] = []

    if kind == "text":
        if file_path and file_path.exists():
            segments = [(_read_text_file(file_path), {})]
        else:
            segments = [(row["content"] or "", {})]

    elif kind == "pdf":
        if not file_path or not file_path.exists():
            raise ValueError("The PDF file is missing; upload it again to index its contents.")
        segments, item_meta = _pdf_segments(file_path)
        if not segments:
            # Not one page produced text, so this is a scanned/image PDF.
            if not llm.can_describe("pdf"):
                raise ValueError(
                    "This PDF has no extractable text (it may be a scanned document), "
                    "and no vision provider is configured. " + llm.media_hint("pdf")
                )
            segments = llm.media_segments(file_path, "pdf")
            item_meta["extraction"] = "vision"

    elif kind == "image":
        if not file_path or not file_path.exists():
            raise ValueError("The image file is missing; upload it again to index its contents.")
        segments, item_meta = _image_segments(file_path, row["title"], source)

    elif kind in ("audio", "video"):
        if not file_path or not file_path.exists():
            raise ValueError(
                f"The {kind} file is missing; upload it again to index its contents."
            )
        if not llm.can_describe(kind):
            raise ValueError(llm.media_hint(kind))
        segments = llm.media_segments(file_path, kind)
        item_meta["extraction"] = "transcript"

    else:
        raise ValueError(f"Unsupported file type: {kind}")

    segments = [(clean_text(text), dict(meta)) for text, meta in segments if text and text.strip()]
    if not segments:
        raise ValueError(
            "No readable content could be extracted from this file. "
            "Add a context note, or try a different file."
        )

    header = "\n\n".join(part for part in (f"# {row['title']}", note) if part.strip())
    if header:
        first_text, first_meta = segments[0]
        segments[0] = (clean_text(f"{header}\n\n{first_text}"), first_meta)

    return segments, item_meta


def process_item(item_id: str) -> None:
    row = db.get_item_row(item_id)
    if row is None:
        return
    db.update_item(item_id, status="processing", error=None)
    try:
        segments, item_meta = build_segments(row)
        pairs = chunk_segments(segments)
        if not pairs:
            raise ValueError("No text could be extracted from this item.")

        texts = [text for text, _ in pairs]
        metas = [meta for _, meta in pairs]
        vectors, signature = llm.embed_documents(texts)
        db.replace_chunks(item_id, texts, vectors, signature, metas)

        content = clean_text("\n\n".join(text for text, _ in segments))
        item_meta["chunks"] = len(pairs)
        db.update_item(
            item_id,
            content=content,
            summary=_summarise(content),
            meta=item_meta,
            status="ready",
            error=None,
        )
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI as `error`
        db.update_item(item_id, status="failed", error=str(exc)[:600])
    finally:
        vector.invalidate()
