from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .. import db, llm, vector
from ..config import TOP_K
from ..schemas import ChatIn, ConversationIn, ConversationRenameIn, SearchIn

router = APIRouter(prefix="/api", tags=["chat"])

SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _retrieve(query: str, top_k: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    query_vec, signature = llm.embed_query(query)
    if not query_vec:
        return [], []
    hits = vector.search(query_vec, top_k=top_k)
    stale = vector.stale_count(signature)
    if stale and not hits:
        # Vectors were built with a different embedding model: rebuild lazily.
        vector.invalidate()
    contexts = [
        {
            "n": index + 1,
            "item_id": hit["item_id"],
            "title": hit["title"],
            "kind": hit["kind"],
            "chunk_idx": hit["chunk_idx"],
            "score": hit["score"],
            "text": hit["text"],
        }
        for index, hit in enumerate(hits)
    ]
    return hits, contexts


@router.post("/search")
def search(payload: SearchIn):
    hits, _ = _retrieve(payload.query, payload.top_k or TOP_K)
    return {"hits": hits}


@router.get("/conversations")
def get_conversations():
    return {"conversations": db.list_conversations()}


@router.post("/conversations")
def create_conversation(payload: ConversationIn):
    return db.create_conversation(payload.title)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    conversation = db.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"conversation": conversation, "messages": db.list_messages(conversation_id)}


@router.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, payload: ConversationRenameIn):
    conversation = db.rename_conversation(conversation_id, payload.title)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str):
    if not db.delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"ok": True}


@router.post("/chat")
def chat(payload: ChatIn):
    conversation = (
        db.get_conversation(payload.conversation_id) if payload.conversation_id else None
    )
    if conversation is None:
        conversation = db.create_conversation(payload.message.strip()[:60] or "New chat")
    conversation_id = conversation["id"]

    history = db.recent_history(conversation_id)
    db.add_message(conversation_id, "user", payload.message)
    db.touch_conversation(conversation_id)

    hits, contexts = _retrieve(payload.message, payload.top_k or TOP_K)

    citations = [
        {
            "item_id": ctx["item_id"],
            "title": ctx["title"],
            "kind": ctx["kind"],
            "chunk_idx": ctx["chunk_idx"],
            "score": ctx["score"],
            "snippet": " ".join(ctx["text"].split())[:240],
        }
        for ctx in contexts
    ]

    def event_stream():
        yield _sse({"type": "conversation", "conversation_id": conversation_id})
        yield _sse({"type": "retrieval", "hits": hits})

        if not contexts:
            message = (
                "I couldn't find anything in your Second Brain about that yet. "
                "Add a note or upload a file on the Library tab and ask me again."
            )
            yield _sse({"type": "token", "text": message})
            stored = db.add_message(conversation_id, "assistant", message, [])
            yield _sse({"type": "done", "message": stored})
            return

        parts: list[str] = []
        try:
            for token in llm.answer_stream(payload.message, contexts, history):
                parts.append(token)
                yield _sse({"type": "token", "text": token})
        except Exception as exc:  # noqa: BLE001 - reported to the client
            error = str(exc)
            yield _sse({"type": "error", "message": error})
            if not parts:
                parts.append(
                    f"I retrieved relevant passages but could not generate an answer: {error}"
                )

        answer = "".join(parts).strip() or "I could not produce an answer from those sources."
        stored = db.add_message(conversation_id, "assistant", answer, citations)
        db.touch_conversation(conversation_id)
        yield _sse({"type": "done", "message": stored})

    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers=SSE_HEADERS
    )
