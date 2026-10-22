# Second Brain — Frontend

A dark, glassmorphic single-page app for a personal **multimodal RAG** knowledge base.
Save notes, PDFs, images, audio and video into one brain, then chat with it. Every answer
comes back with citations that link straight to the source material.

Built with **Vite + React 18 + TypeScript**, **Tailwind CSS v4** (CSS-first config via
`@tailwindcss/vite`), **lucide-react**, **framer-motion**, **react-markdown** + **remark-gfm**.

No router (tab-based navigation), no state library, no UI kit.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

The dev server proxies `/api/*` to the backend at `http://127.0.0.1:8000`
(see `vite.config.ts`), so start the backend separately.

```bash
npm run build    # tsc -b && vite build  -> dist/
npm run preview  # serve the production build
```

## Screens

| Tab | What it does |
| --- | --- |
| **Library** | Filter/sort every item, live stats, upload panel, polling while items are indexing, detail drawer with previews and chunk inspector. |
| **Chat** | Conversation rail, markdown answers, SSE token streaming, retrieval skeleton cards, citation chips that open the source item. |
| **Insights** | Per-kind distribution, items per day (14 days), top tags and storage totals — all computed client-side. |

## Architecture

```
src/
  lib/
    types.ts    # API contract types (mirrors the backend exactly)
    api.ts      # the ONLY module that knows about URLs
    utils.ts    # formatting helpers + per-kind design metadata
  components/   # presentational + interactive building blocks
  views/        # LibraryView, ChatView, InsightsView
  App.tsx       # tab state, health polling, modal/drawer orchestration
```

`src/lib/api.ts` owns every request: plain JSON calls, the `XMLHttpRequest` uploader
(real progress via `upload.onprogress`) and `streamChat()`, a robust SSE reader built on
`fetch` + `response.body.getReader()` + `TextDecoder` that buffers partial frames, splits on
`\n\n`, supports an `AbortSignal`, and reports errors as `ApiError` carrying the FastAPI
`detail` message.

## Design system

- Deep near-black canvas with layered indigo/violet/cyan radial gradients plus a grid and
  noise texture, animated blobs, and glass panels
  (`bg-white/[0.04] border border-white/10 backdrop-blur-xl rounded-3xl`).
- Indigo → violet gradient for primary actions; emerald / amber / fuchsia / sky / rose accents
  per media kind (text / pdf / image / audio / video).
- Inter throughout, fully rounded pills, gradient underline bars under every section heading,
  custom scrollbars, focus-visible rings and `aria-label`s on icon-only buttons.
- Responsive: the sidebar collapses to a bottom icon bar under `md`, primary buttons keep
  their text labels on mobile.

## Backend contract

The app assumes the exact endpoints described in the project brief: `/api/health`,
`/api/items` (list/upload/text/reprocess/delete/file), `/api/search`, `/api/conversations`
and the `POST /api/chat` SSE stream. Errors are surfaced as toasts using the backend's
`{ "detail": "..." }` message. When `/api/health` reports `mode === "local"`, an amber banner
in the top bar nudges you to add `GEMINI_API_KEY` to `backend/.env`.
