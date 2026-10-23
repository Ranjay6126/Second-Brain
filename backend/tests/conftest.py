"""Test configuration.

The environment has to be redirected *before* ``app.config`` is imported, so
this module sets the variables at import time rather than inside a fixture.
Every test therefore runs against a throwaway data directory and never touches
the developer's real library.
"""

from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

_TMP = Path(tempfile.mkdtemp(prefix="second-brain-tests-"))
atexit.register(shutil.rmtree, _TMP, True)

os.environ["DATA_DIR"] = str(_TMP)
# Deterministic, offline answers: the tests must not depend on the network.
os.environ["LLM_PROVIDER"] = "local"
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("GOOGLE_API_KEY", None)
os.environ.pop("OPENROUTER_API_KEY", None)
os.environ.pop("GROQ_API_KEY", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    """A TestClient with the app lifespan (and DB migrations) applied."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def clean_library():
    """Delete every item between tests so assertions about counts stay exact."""
    yield
    items, _ = db.list_items(limit=500)
    for item in items:
        db.delete_item(item["id"])


def wait_for_status(client: TestClient, item_id: str, timeout: float = 90.0) -> dict:
    """Poll an item until background ingestion leaves the 'processing' state."""
    import time

    deadline = time.time() + timeout
    item: dict = {}
    while time.time() < deadline:
        response = client.get(f"/api/items/{item_id}")
        assert response.status_code == 200, response.text
        item = response.json()
        if item["status"] != "processing":
            return item
        time.sleep(0.25)
    raise AssertionError(f"Item {item_id} stayed in 'processing': {item}")


def upload(client: TestClient, filename: str, data: bytes, **fields) -> dict:
    response = client.post(
        "/api/items/upload",
        files={"file": (filename, data, "application/octet-stream")},
        data=fields,
    )
    return response


def build_pdf(lines: list[str], title: str = "Test document") -> bytes:
    """A minimal but genuinely valid single-page PDF with extractable text."""
    content = "BT /F1 14 Tf 72 720 Td 20 TL\n"
    for line in lines:
        safe = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content += f"({safe}) Tj T*\n"
    content += "ET"
    stream = content.encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Title (".encode()
        + title.replace("(", r"\(").replace(")", r"\)").encode("latin-1")
        + b") >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 6 0 R >>\n"
        f"startxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


def build_png(width: int = 64, height: int = 48) -> bytes:
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (32, 96, 160)).save(buffer, format="PNG")
    return buffer.getvalue()


def sse_events(body: str) -> list[dict]:
    """Parse an `text/event-stream` body into its JSON frames."""
    import json

    events = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload in ("", "[DONE]"):
            continue
        try:
            events.append(json.loads(payload))
        except json.JSONDecodeError:
            continue
    return events
