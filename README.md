# Second Brain

A personal, multimodal knowledge base. Save notes, PDFs, images, audio and video into one place,
then ask questions in natural language and get grounded answers with citations back to the exact
thing you saved.

Built as a retrieval-augmented generation (RAG) application: everything you upload is converted to
text, chunked, embedded into a vector index, and retrieved at question time to ground the answer.

---

## Features

**Save anything**

| Type | How it is indexed |
| --- | --- |
| Text note | Indexed directly |
| PDF / TXT / MD / CSV / code | `pypdf` text extraction; scanned PDFs fall back to Gemini document understanding |
| Image | Gemini vision: full description, OCR of visible text, key points |
| Audio | Gemini native audio understanding: transcript + summary + key points |
| Video | Gemini native video understanding: scene-by-scene overview + transcript |

**Ask anything**

- Retrieval-augmented chat that streams answers token by token.
- Every answer carries citation chips; click one to open the exact item it came from.
- Conversation history is persisted, renameable and deletable.
- Raw semantic search endpoint (`/api/search`) for building on top of.

**See everything**

- Glassmorphic library with per-type filters, sorting, live indexing status and reprocessing.
- Insights view: type distribution, items added per day, top tags, storage usage.
- Upload progress, drag & drop, and background indexing you can keep working through.

---

## Architecture

```
┌────────────────────────────┐        ┌──────────────────────────────────────────┐
│  React 18 + Vite + TS      │        │  FastAPI                                 │
│  Tailwind v4 + framer-motion│  /api │                                          │
│                            │ ─────► │  routers/items.py   upload · list · CRUD │
│  Library · Chat · Insights │        │  routers/chat.py    SSE chat · search    │
└────────────────────────────┘        │                                          │
                                      │  ingest.py   extract → chunk → embed     │
                                      │  llm.py      Gemini wrapper + fallback   │
                                      │  vector.py   cached numpy vector index   │
                                      │  db.py       SQLite (items/chunks/chat)  │
                                      └──────────────────────────────────────────┘
                                                      │
                              data/brain.db  ·  data/uploads/<file>  ·  Gemini API
```

Retrieval is a single matrix multiply: every chunk embedding is stored in SQLite as a `float32`
blob and mirrored into one L2-normalised numpy matrix that is cached in process and invalidated
whenever chunks change. No external vector database to run.

Each chunk records the embedding model **and** dimension it was produced with, so vectors from a
different model are never compared against each other.

---

## Running it

Requirements: **Python 3.10+** and **Node 18+**.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The API is now at `http://127.0.0.1:8000` (docs at `/docs`).

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### 3. Add a Gemini key (recommended)

Get a free key at <https://aistudio.google.com/apikey> and put it in `backend/.env`:

```
GEMINI_API_KEY=your-key-here
```

Restart the backend. `GET /api/health` will report `"mode": "gemini"` instead of `"local"`.

> **Without a key** the app still runs in **local mode**: text, PDF and code files are searchable
> through a local hashing-based embedding, and answers are extractive (the best matching passages).
> Images, audio and video can only be found by their title, tags and context note — Gemini is what
> reads the actual pixels and waveforms. Existing items are re-embedded automatically when you
> press **Reprocess**, or you can just re-upload them.

### Production build (single process)

```powershell
cd frontend
npm run build
```

FastAPI automatically serves `frontend/dist` at `/` when it exists, so `uvicorn app.main:app`
alone gives you the whole app.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Mode, models, item/chunk counts, index dimensions |
| `GET` | `/api/items` | List items (`kind`, `q`, `status`, `limit`, `offset`) |
| `GET` | `/api/items/{id}` | Item detail with extracted content and chunks |
| `GET` | `/api/items/{id}/file` | Original file bytes |
| `POST` | `/api/items/text` | Save a note (synchronous indexing) |
| `POST` | `/api/items/upload` | Upload a file (background indexing) |
| `POST` | `/api/items/{id}/reprocess` | Re-extract and re-embed an item |
| `DELETE` | `/api/items/{id}` | Delete an item and its file |
| `POST` | `/api/search` | Semantic search over all chunks |
| `GET` | `/api/conversations` | List conversations |
| `POST` | `/api/conversations` | Create a conversation |
| `GET` | `/api/conversations/{id}` | Conversation with messages |
| `PATCH` | `/api/conversations/{id}` | Rename |
| `DELETE` | `/api/conversations/{id}` | Delete |
| `POST` | `/api/chat` | RAG chat, `text/event-stream` |

`POST /api/chat` streams server-sent events. Each frame is `data: {json}\n\n` with
`type` in `conversation` · `retrieval` · `token` · `done` · `error`.

```jsonc
{ "type": "retrieval", "hits": [ /* scored chunks */ ] }
{ "type": "token", "text": "partial answer" }
{ "type": "done", "message": { "content": "...", "citations": [ /* ... */ ] } }
```

---

## Configuration

All optional, set in `backend/.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` | – | Enables full multimodal understanding |
| `EMBED_MODEL` | `gemini-embedding-001` | Embedding model |
| `CHAT_MODEL` | `gemini-2.5-flash` | Answer generation model |
| `MEDIA_MODEL` | `CHAT_MODEL` | Model used to read images/audio/video/PDF |
| `EMBED_DIM` | `768` | Embedding dimension |
| `TOP_K` | `6` | Chunks retrieved per question |
| `CHUNK_SIZE` / `CHUNK_OVERLAP` | `1400` / `200` | Chunking window |
| `MAX_UPLOAD_MB` | `200` | Upload size limit |
| `DATA_DIR` / `DB_PATH` | `backend/data` | Where files and the SQLite DB live |

---

## Project layout

```
backend/
  app/
    main.py            FastAPI app, CORS, health, SPA mount
    config.py          env + paths
    db.py              SQLite schema and queries
    chunking.py        paragraph-aware overlapping chunker
    llm.py             Gemini client, media understanding, answer streaming
    vector.py          cached numpy vector index
    ingest.py          per-type extraction pipeline
    schemas.py         request models
    routers/
      items.py         library CRUD + upload
      chat.py          SSE chat, search, conversations
frontend/
  src/
    lib/api.ts         the only module that knows API URLs
    views/             LibraryView · ChatView · InsightsView
    components/        Sidebar, TopBar, UploadPanel, ItemCard, drawer, chat UI
```

## Data & privacy

Everything lives in `backend/data/` on your machine and is git-ignored. The only outbound traffic
is to the Gemini API, and only for the files you actually index plus your questions. Delete an item
and both its file and its vectors are removed.
