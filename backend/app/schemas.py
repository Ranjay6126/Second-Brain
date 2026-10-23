from __future__ import annotations

from pydantic import BaseModel, Field


class TextItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=1)
    note: str | None = None
    tags: list[str] | None = None


class SearchIn(BaseModel):
    query: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=50)
    item_ids: list[str] | None = Field(default=None, description="Restrict search to these items.")


class ChatIn(BaseModel):
    conversation_id: str | None = None
    message: str = Field(min_length=1)
    top_k: int | None = Field(default=None, ge=1, le=50)
    item_ids: list[str] | None = Field(default=None, description="Restrict search to these items.")


class ConversationIn(BaseModel):
    title: str | None = None


class ConversationRenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
