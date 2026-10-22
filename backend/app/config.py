from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent

load_dotenv(BASE_DIR / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


DATA_DIR = Path(os.getenv("DATA_DIR") or (BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = Path(os.getenv("DB_PATH") or (DATA_DIR / "brain.db"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()

EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
CHAT_MODEL = os.getenv("CHAT_MODEL", "gemini-2.5-flash")
MEDIA_MODEL = os.getenv("MEDIA_MODEL") or CHAT_MODEL
EMBED_DIM = _int("EMBED_DIM", 768)

CHUNK_SIZE = _int("CHUNK_SIZE", 1400)
CHUNK_OVERLAP = _int("CHUNK_OVERLAP", 200)
TOP_K = _int("TOP_K", 6)
MAX_UPLOAD_MB = _int("MAX_UPLOAD_MB", 200)
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Where the Vite dev server runs (and the built SPA if `frontend/dist` exists).
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"

DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]


def llm_mode() -> str:
    return "gemini" if GEMINI_API_KEY else "local"
