from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import db, ingest, llm, vector
from .config import (
    DEV_ORIGINS,
    EMBED_DIM,
    EMBED_MODEL,
    FRONTEND_DIST,
    MAX_UPLOAD_MB,
    TOP_K,
)
from .routers import chat as chat_router
from .routers import items as items_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(
    title="Second Brain API",
    description="Personal multimodal knowledge base with retrieval-augmented answers.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEV_ORIGINS,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(items_router.router)
app.include_router(chat_router.router)


@app.get("/api/health", tags=["meta"])
def health():
    totals = db.counts()
    return {
        "status": "ok",
        "provider": llm.provider(),
        "embed_model": EMBED_MODEL if llm.has_gemini_key() else f"local-hash-{EMBED_DIM}",
        "chat_model": llm.answer_model_name(),
        "capabilities": {
            "text": True,
            "pdf": True,
            "image": llm.can_describe("image"),
            "audio": llm.can_describe("audio"),
            "video": llm.can_describe("video"),
        },
        "top_k": TOP_K,
        "index": vector.stats(),
        "key_configured": llm.has_configured_key(),
        "items": totals["items"],
        "chunks": totals["chunks"],
    }


@app.get("/api/stats", tags=["meta"])
def stats():
    """Real library numbers for the dashboard - never estimated."""
    return db.library_stats()


@app.get("/api/capabilities", tags=["meta"])
def capabilities():
    return {
        "provider": llm.provider(),
        "chat_model": llm.answer_model_name(),
        "kinds": {
            "text": True,
            "pdf": True,
            "image": llm.can_describe("image"),
            "audio": llm.can_describe("audio"),
            "video": llm.can_describe("video"),
        },
        "supported_extensions": ingest.SUPPORTED_EXTENSIONS,
        "max_upload_mb": MAX_UPLOAD_MB,
    }


if FRONTEND_DIST.exists():
    # Production convenience: `npm run build` then serve the SPA from FastAPI.
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="spa")
