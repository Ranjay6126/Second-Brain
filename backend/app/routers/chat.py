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


NO_ANSWER = (
    "I couldn't find enough information in your uploaded sources to answer this question."
)


def _retrieve(
    query: str,
    top_k: int,
    item_ids: list[str] | None = None,
    strict: bool | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    query_vec, signature = llm.embed_query(query)
    # Without a language model to judge the passages, only passages that share
    # real words with the question may be quoted back to the user. With a model
    # in the loop the ranking can stay permissive: the system prompt already
    # tells it to say it could not find an answer when the context does not
    # contain one. `/api/search` is a diagnostic endpoint, so it always returns
    # the closest passages and leaves the honesty gate to the chat path.
    if strict is None:
        strict = llm.provider() == "local"
    hits = vector.search(
        query_vec if query_vec else None,
        top_k=top_k,
        item_ids=item_ids,
        query_text=query,
        strict=strict,
    )
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
            "meta": hit.get("meta") or {},
            "text": hit["text"],
        }
        for index, hit in enumerate(hits)
    ]
    return hits, contexts


def _unreadable_notice() -> str | None:
    """Explain a dead-end answer when stored media could not be read.

    Without a vision/transcription provider an image, audio or video file is
    stored but its contents are never extracted, so no answer can possibly be
    drawn from it. Saying which files are affected and which key unlocks them
    turns a dead end into a next step.
    """
    blocked = db.unreadable_media()
    if not blocked:
        return None
    listed = " and ".join(
        f"{row['count']} {row['kind']} file" + ("s" if row["count"] != 1 else "")
        for row in blocked
    )
    hints = " ".join(llm.media_hint(row["kind"]) for row in blocked)
    return (
        f"Heads-up: {listed} in your library could not be read, so their contents are "
        f"not searchable and cannot answer this question. {hints} After restarting the "
        f"backend, use Reprocess on the file to index it for real."
    )


def _citation(context: dict[str, Any]) -> dict[str, Any]:
    meta = context.get("meta") or {}
    return {
        "item_id": context["item_id"],
        "title": context["title"],
        "kind": context["kind"],
        "chunk_idx": context["chunk_idx"],
        "score": context["score"],
        "page": meta.get("page"),
        "timestamp": meta.get("timestamp"),
        "end_timestamp": meta.get("end_timestamp"),
        "location": llm.locate(meta).lstrip(", ") or None,
        "snippet": " ".join(context["text"].split())[:240],
    }


@router.post("/search")
def search(payload: SearchIn):
    hits, _ = _retrieve(
        payload.query, payload.top_k or TOP_K, payload.item_ids, strict=False
    )
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

    hits, contexts = _retrieve(
        payload.message, payload.top_k or TOP_K, payload.item_ids
    )
    citations = [_citation(ctx) for ctx in contexts]

    def event_stream():
        yield _sse({"type": "conversation", "conversation_id": conversation_id})
        yield _sse({"type": "retrieval", "hits": hits})

        if not contexts:
            yield _sse({"type": "token", "text": NO_ANSWER})
            stored = db.add_message(conversation_id, "assistant", NO_ANSWER, [])
            notice = _unreadable_notice()
            if notice:
                yield _sse({"type": "notice", "notice": notice})
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
        # A no-answer must stay uncited: the passages were retrieved but did not
        # support an answer, so linking them would claim support that isn't there.
        cited = [] if NO_ANSWER in answer else citations
        stored = db.add_message(conversation_id, "assistant", answer, cited)
        db.touch_conversation(conversation_id)
        if NO_ANSWER in answer:
            notice = _unreadable_notice()
            if notice:
                yield _sse({"type": "notice", "notice": notice})
        yield _sse({"type": "done", "message": stored})

    return StreamingResponse(
        event_stream(), media_type="text/event-stream", headers=SSE_HEADERS
    )
