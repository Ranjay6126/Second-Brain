
# Second Brain

Second Brain is an AI-powered personal knowledge management application built using Python and RAG (Retrieval-Augmented Generation).

Users can upload text, PDFs, images, audio, and videos, then ask questions about their saved information and get relevant answers using AI.

## Features

- Upload text, PDF, image, audio, and video files.
- Save and manage personal notes.
- Extract information from uploaded files.
- Ask questions about saved content.
- Get AI-generated answers using RAG.
- Search information using semantic search.
- Simple and user-friendly interface.

## Technologies Used

- Python
- FastAPI
- React
- TypeScript
- SQLite
- Google Gemini API
- NumPy
- Retrieval-Augmented Generation (RAG)

## Run locally (Windows PowerShell)

Install dependencies once:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cd ..\frontend
npm install
```

Start the API and UI in separate terminals:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

```powershell
cd frontend
npm run dev
```

Open http://localhost:5173. The API health check is at http://127.0.0.1:8000/api/health.

## Models and privacy

With no API keys, text and text-based PDFs are indexed locally and questions use
local retrieval with extractive answers. Image, audio, video, and scanned-PDF
understanding require a compatible provider; uploads that cannot be read are
marked as failed with a reason rather than indexed as if their contents were
understood.

To enable multimodal extraction and generated answers, copy
`backend/.env.example` to `backend/.env` and set a provider key. Gemini supports
images, audio, video, and scanned PDFs; OpenRouter supports images; Groq supports
audio transcription. Configure `LLM_PROVIDER=auto` to use a configured provider,
or select one directly. Remote providers receive uploaded media and/or retrieved
passages when processing your requests. Pollinations is keyless but remote and
must be explicitly selected with `LLM_PROVIDER=pollinations`.

## How It Works

1. Upload files or save notes.
2. Extract and process the content.
3. Create embeddings and store them for retrieval.
4. Ask questions about your information.
5. Retrieve relevant content and generate answers using RAG.

## Project Goal

To build a personal AI assistant that helps users store, search, and understand their information in one place.

## Author

Ranjay Prajapati