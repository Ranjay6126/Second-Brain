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

# --- Optional remote model providers ----------------------------------------
# Remote providers receive retrieved note/document content. The default stays
# local so private user data is never sent to a third party without opting in.
POLLINATIONS_BASE_URL = os.getenv(
    "POLLINATIONS_BASE_URL", "https://text.pollinations.ai/openai"
).rstrip("/")
POLLINATIONS_MODEL = (os.getenv("POLLINATIONS_MODEL") or "openai").strip()

OPENROUTER_API_KEY = (os.getenv("OPENROUTER_API_KEY") or "").strip()
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_MODEL = (os.getenv("OPENROUTER_MODEL") or "google/gemma-4-31b-it:free").strip()
OPENROUTER_VISION_MODEL = (
    os.getenv("OPENROUTER_VISION_MODEL") or "nvidia/nemotron-3.5-super-vl:free"
).strip()

GROQ_API_KEY = (os.getenv("GROQ_API_KEY") or "").strip()
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
GROQ_MODEL = (os.getenv("GROQ_MODEL") or "openai/gpt-oss-120b").strip()
GROQ_VISION_MODEL = (os.getenv("GROQ_VISION_MODEL") or GROQ_MODEL).strip()
GROQ_TRANSCRIBE_MODEL = (os.getenv("GROQ_TRANSCRIBE_MODEL") or "whisper-large-v3").strip()

# "auto" prefers a configured provider, then the keyless Pollinations endpoint.
LLM_PROVIDER = (os.getenv("LLM_PROVIDER") or "auto").strip().lower()

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


def active_provider() -> str:
    """Which provider answers questions.

    An explicit ``LLM_PROVIDER`` wins. Otherwise the first provider that has a
    key is used. With no keys at all the keyless Pollinations endpoint answers,
    so the app works immediately after install; set ``LLM_PROVIDER=local`` to
    keep every answer on this machine instead.
    """
    if LLM_PROVIDER and LLM_PROVIDER != "auto":
        return LLM_PROVIDER
    if GEMINI_API_KEY:
        return "gemini"
    if OPENROUTER_API_KEY:
        return "openrouter"
    if GROQ_API_KEY:
        return "groq"
    return "pollinations"
