from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT '',
  mime       TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_path  TEXT,
  note       TEXT,
  summary    TEXT,
  content    TEXT,
  tags       TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'ready',
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     TEXT NOT NULL,
  idx         INTEGER NOT NULL,
  text        TEXT NOT NULL,
  embedding   BLOB NOT NULL,
  dim         INTEGER NOT NULL,
  embed_model TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chunks_item ON chunks(item_id);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  citations       TEXT NOT NULL DEFAULT '[]',
  created_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db() as conn:
        conn.executescript(SCHEMA)


# --------------------------------------------------------------------------- items


def _tags_to_str(tags: Any) -> str:
    if tags is None:
        return ""
    if isinstance(tags, str):
        parts = [t.strip() for t in tags.split(",")]
    else:
        parts = [str(t).strip() for t in tags]
    seen: list[str] = []
    for part in parts:
        if part and part.lower() not in {s.lower() for s in seen}:
            seen.append(part)
    return ",".join(seen)


def tags_to_list(raw: Any) -> list[str]:
    if not raw:
        return []
    return [t.strip() for t in str(raw).split(",") if t.strip()]


def row_to_item(row: sqlite3.Row, chunk_count: int = 0) -> dict[str, Any]:
    from .config import UPLOAD_DIR

    file_path = row["file_path"]
    has_file = bool(file_path) and (UPLOAD_DIR / file_path).exists()
    return {
        "id": row["id"],
        "title": row["title"],
        "kind": row["kind"],
        "source": row["source"] or "",
        "mime": row["mime"],
        "size_bytes": row["size_bytes"] or 0,
        "file_url": f"/api/items/{row['id']}/file" if has_file else None,
        "note": row["note"],
        "summary": row["summary"],
        "tags": tags_to_list(row["tags"]),
        "status": row["status"],
        "error": row["error"],
        "chunk_count": chunk_count,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


_ITEM_SELECT = """
SELECT i.*, (SELECT COUNT(*) FROM chunks c WHERE c.item_id = i.id) AS chunk_count
FROM items i
"""


def create_item(**fields: Any) -> dict[str, Any]:
    item_id = fields.get("id") or new_id()
    ts = now_iso()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO items (id, title, kind, source, mime, size_bytes, file_path,
                               note, summary, content, tags, status, error, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                fields["title"],
                fields["kind"],
                fields.get("source", ""),
                fields.get("mime"),
                int(fields.get("size_bytes") or 0),
                fields.get("file_path"),
                fields.get("note"),
                fields.get("summary"),
                fields.get("content"),
                _tags_to_str(fields.get("tags")),
                fields.get("status", "ready"),
                fields.get("error"),
                ts,
                ts,
            ),
        )
    return get_item(item_id)  # type: ignore[return-value]


def update_item(item_id: str, **fields: Any) -> None:
    if not fields:
        return
    allowed = {
        "title",
        "summary",
        "content",
        "status",
        "error",
        "note",
        "tags",
        "kind",
        "source",
        "mime",
        "size_bytes",
        "file_path",
    }
    sets: list[str] = []
    values: list[Any] = []
    for key, value in fields.items():
        if key not in allowed:
            continue
        sets.append(f"{key} = ?")
        values.append(_tags_to_str(value) if key == "tags" else value)
    if not sets:
        return
    sets.append("updated_at = ?")
    values.append(now_iso())
    values.append(item_id)
    with db() as conn:
        conn.execute(f"UPDATE items SET {', '.join(sets)} WHERE id = ?", values)


def get_item(item_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(f"{_ITEM_SELECT} WHERE i.id = ?", (item_id,)).fetchone()
        if row is None:
            return None
        return row_to_item(row, row["chunk_count"])


def get_item_row(item_id: str) -> sqlite3.Row | None:
    with db() as conn:
        return conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()


def list_items(
    kind: str | None = None,
    q: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    where: list[str] = []
    params: list[Any] = []
    if kind:
        where.append("i.kind = ?")
        params.append(kind)
    if status:
        where.append("i.status = ?")
        params.append(status)
    if q:
        like = f"%{q.lower()}%"
        where.append(
            "(LOWER(i.title) LIKE ? OR LOWER(COALESCE(i.summary,'')) LIKE ? "
            "OR LOWER(COALESCE(i.content,'')) LIKE ? OR LOWER(i.tags) LIKE ?)"
        )
        params.extend([like, like, like, like])

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    with db() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS c FROM items i {clause}", params).fetchone()["c"]
        rows = conn.execute(
            f"{_ITEM_SELECT} {clause} ORDER BY i.created_at DESC, i.rowid DESC LIMIT ? OFFSET ?",
            [*params, limit, offset],
        ).fetchall()
    return [row_to_item(r, r["chunk_count"]) for r in rows], int(total)


def delete_item(item_id: str) -> bool:
    with db() as conn:
        cur = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        return cur.rowcount > 0


def replace_chunks(item_id: str, texts: list[str], vectors: list[list[float]], model: str) -> None:
    import numpy as np

    with db() as conn:
        conn.execute("DELETE FROM chunks WHERE item_id = ?", (item_id,))
        conn.executemany(
            "INSERT INTO chunks (item_id, idx, text, embedding, dim, embed_model) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    item_id,
                    idx,
                    text,
                    np.asarray(vec, dtype=np.float32).tobytes(),
                    len(vec),
                    model,
                )
                for idx, (text, vec) in enumerate(zip(texts, vectors))
            ],
        )


def get_chunks(item_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT idx, text FROM chunks WHERE item_id = ? ORDER BY idx", (item_id,)
        ).fetchall()
    return [{"idx": r["idx"], "text": r["text"]} for r in rows]


def counts() -> dict[str, int]:
    with db() as conn:
        items = conn.execute(
            "SELECT COUNT(*) AS c FROM items WHERE status != 'failed'"
        ).fetchone()["c"]
        chunks = conn.execute("SELECT COUNT(*) AS c FROM chunks").fetchone()["c"]
    return {"items": int(items), "chunks": int(chunks)}


# -------------------------------------------------------------------- conversations


def create_conversation(title: str | None = None) -> dict[str, Any]:
    conv_id = new_id()
    ts = now_iso()
    with db() as conn:
        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (conv_id, (title or "New chat").strip() or "New chat", ts, ts),
        )
    return {"id": conv_id, "title": title or "New chat", "created_at": ts, "updated_at": ts, "message_count": 0}


def list_conversations() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
            FROM conversations c ORDER BY c.updated_at DESC
            """
        ).fetchall()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "message_count": int(r["message_count"]),
        }
        for r in rows
    ]


def get_conversation(conv_id: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute(
            """
            SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
            FROM conversations c WHERE c.id = ?
            """,
            (conv_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "id": row["id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "message_count": int(row["message_count"]),
    }


def rename_conversation(conv_id: str, title: str) -> dict[str, Any] | None:
    with db() as conn:
        conn.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            (title.strip() or "New chat", now_iso(), conv_id),
        )
    return get_conversation(conv_id)


def touch_conversation(conv_id: str) -> None:
    with db() as conn:
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now_iso(), conv_id))


def delete_conversation(conv_id: str) -> bool:
    with db() as conn:
        cur = conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        return cur.rowcount > 0


def row_to_message(row: sqlite3.Row) -> dict[str, Any]:
    try:
        citations = json.loads(row["citations"] or "[]")
    except json.JSONDecodeError:
        citations = []
    return {
        "id": row["id"],
        "conversation_id": row["conversation_id"],
        "role": row["role"],
        "content": row["content"],
        "citations": citations,
        "created_at": row["created_at"],
    }


def add_message(
    conv_id: str, role: str, content: str, citations: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    msg_id = new_id()
    ts = now_iso()
    with db() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, citations, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (msg_id, conv_id, role, content, json.dumps(citations or []), ts),
        )
    return {
        "id": msg_id,
        "conversation_id": conv_id,
        "role": role,
        "content": content,
        "citations": citations or [],
        "created_at": ts,
    }


def list_messages(conv_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid",
            (conv_id,),
        ).fetchall()
    return [row_to_message(r) for r in rows]


def recent_history(conv_id: str, limit: int = 6) -> list[dict[str, str]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
            (conv_id, limit),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]
