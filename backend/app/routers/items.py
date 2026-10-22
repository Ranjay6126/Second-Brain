from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from .. import db, ingest, vector
from ..config import MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_DIR
from ..schemas import TextItemIn

router = APIRouter(prefix="/api/items", tags=["items"])

_READ_CHUNK = 1024 * 512


@router.get("")
def list_items(
    kind: str | None = Query(default=None),
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    items, total = db.list_items(kind=kind, q=q, status=status, limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.post("/text")
def create_text_item(payload: TextItemIn):
    item = db.create_item(
        title=payload.title.strip(),
        kind="text",
        source="note",
        content=payload.content,
        note=payload.note,
        tags=payload.tags,
        status="processing",
    )
    ingest.process_item(item["id"])
    stored = db.get_item(item["id"])
    if stored is None:
        raise HTTPException(status_code=500, detail="Could not store the note.")
    if stored["status"] == "failed":
        raise HTTPException(status_code=400, detail=stored["error"] or "Indexing failed.")
    return stored


@router.post("/upload")
async def upload_item(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    note: str | None = Form(default=None),
    tags: str | None = Form(default=None),
):
    filename = Path(file.filename or "upload").name
    if not filename:
        raise HTTPException(status_code=400, detail="A file name is required.")

    kind = ingest.detect_kind(filename, file.content_type)
    item_id = db.new_id()
    suffix = Path(filename).suffix.lower()[:12]
    stored_name = f"{item_id}{suffix}"
    destination = UPLOAD_DIR / stored_name

    size = 0
    try:
        with destination.open("wb") as handle:
            while True:
                block = await file.read(_READ_CHUNK)
                if not block:
                    break
                size += len(block)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413, detail=f"File exceeds the {MAX_UPLOAD_MB} MB limit."
                    )
                handle.write(block)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    except OSError as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not save the upload: {exc}") from exc

    if size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    item = db.create_item(
        id=item_id,
        title=(title or "").strip() or Path(filename).stem or filename,
        kind=kind,
        source=filename,
        mime=file.content_type or mimetypes.guess_type(filename)[0],
        size_bytes=size,
        file_path=stored_name,
        note=note,
        tags=tags or "",
        status="processing",
    )
    background.add_task(ingest.process_item, item_id)
    return item


@router.get("/{item_id}")
def get_item(item_id: str):
    item = db.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found.")
    return {**item, "content": db.get_item_row(item_id)["content"], "chunks": db.get_chunks(item_id)}


@router.get("/{item_id}/file")
def get_item_file(item_id: str):
    row = db.get_item_row(item_id)
    if row is None or not row["file_path"]:
        raise HTTPException(status_code=404, detail="This item has no stored file.")
    path = UPLOAD_DIR / row["file_path"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="The stored file is missing.")
    media_type = row["mime"] or mimetypes.guess_type(row["source"] or "")[0] or "application/octet-stream"
    return FileResponse(
        path,
        media_type=media_type,
        filename=row["source"] or path.name,
        content_disposition_type="inline",
    )


@router.post("/{item_id}/reprocess")
def reprocess_item(item_id: str, background: BackgroundTasks):
    item = db.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found.")
    db.update_item(item_id, status="processing", error=None)
    background.add_task(ingest.process_item, item_id)
    return db.get_item(item_id)


@router.delete("/{item_id}")
def delete_item(item_id: str):
    row = db.get_item_row(item_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Item not found.")
    if row["file_path"]:
        (UPLOAD_DIR / row["file_path"]).unlink(missing_ok=True)
    db.delete_item(item_id)
    vector.invalidate()
    return {"ok": True}
