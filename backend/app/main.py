from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import db, llm, vector
from .config import (
    CHAT_MODEL,
    DEV_ORIGINS,
    EMBED_MODEL,
    FRONTEND_DIST,
    GEMINI_API_KEY,
    MEDIA_MODEL,
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
        "mode": "gemini" if GEMINI_API_KEY else "local",
        "embed_model": EMBED_MODEL if GEMINI_API_KEY else "local-hash-768",
        "chat_model": CHAT_MODEL if GEMINI_API_KEY else "extractive-local",
        "media_model": MEDIA_MODEL if GEMINI_API_KEY else "none",
        "top_k": TOP_K,
        "index": vector.stats(),
        "key_configured": bool(GEMINI_API_KEY),
        "items": totals["items"],
        "chunks": totals["chunks"],
    }


if FRONTEND_DIST.exists():
    # Production convenience: `npm run build` then serve the SPA from FastAPI.
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="spa")
