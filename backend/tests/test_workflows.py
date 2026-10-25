"""End-to-end checks for the critical Second Brain workflows.

These exercise the real FastAPI app against a real (temporary) SQLite database
and real files on disk. Nothing is mocked, so a passing suite means the
workflows genuinely work on this machine.

Answers are produced with ``LLM_PROVIDER=local`` (see ``conftest.py``) so the
suite never needs the network. Retrieval, chunking, page/timestamp metadata,
citations, persistence and deletion are all still exercised for real.
"""

from __future__ import annotations

from app import db, vector
from app.chunking import chunk_segments
from app.routers.chat import NO_ANSWER

from conftest import build_pdf, build_png, sse_events, upload, wait_for_status


# ------------------------------------------------------------------ meta / API


def test_health_reports_capabilities(client):
    health = client.get("/api/health").json()
    assert health["status"] == "ok"
    assert health["provider"] == "local"
    assert health["capabilities"]["text"] is True
    assert health["capabilities"]["pdf"] is True
    # No keys are configured in tests, so media understanding is off.
    assert health["capabilities"]["image"] is False
    assert health["key_configured"] is False


def test_capabilities_lists_supported_extensions(client):
    payload = client.get("/api/capabilities").json()
    for extension in (".pdf", ".txt", ".md", ".png", ".mp3", ".mp4"):
        assert extension in payload["supported_extensions"]
    assert payload["max_upload_mb"] > 0


def test_stats_endpoint_returns_real_numbers(client, clean_library):
    before = client.get("/api/stats").json()
    client.post("/api/items/text", json={"title": "Stats probe", "content": "hello world"})
    after = client.get("/api/stats").json()
    assert after["items"] == before["items"] + 1
    assert after["chunks"] >= before["chunks"] + 1
    assert after["upload_bytes"] >= 0
    assert isinstance(after["by_kind"], list)


# ---------------------------------------------------------------- text notes


def test_text_note_is_indexed_and_searchable(client, clean_library):
    created = client.post(
        "/api/items/text",
        json={
            "title": "Focus notes",
            "content": "Deep work needs long uninterrupted blocks and a written intention.",
            "tags": ["focus"],
        },
    )
    assert created.status_code == 200, created.text
    item = created.json()
    assert item["status"] == "ready"
    assert item["chunk_count"] >= 1

    hits = client.post("/api/search", json={"query": "deep work uninterrupted"}).json()["hits"]
    assert hits, "the note should be retrievable by its own words"
    assert hits[0]["item_id"] == item["id"]


def test_unrelated_question_produces_the_honest_no_answer(client, clean_library):
    client.post(
        "/api/items/text",
        json={"title": "Recipe", "content": "Mix flour and water, then bake for twenty minutes."},
    )
    vector.invalidate()

    # Nothing in the library shares a word with this question.
    events = sse_events(
        client.post("/api/chat", json={"message": "what is the capital of france"}).text
    )
    done = [e for e in events if e["type"] == "done"]
    assert done and done[0]["message"]["content"] == NO_ANSWER
    assert done[0]["message"]["citations"] == []


# ---------------------------------------------------------------------- PDF


def test_pdf_is_indexed_with_page_metadata_and_cited(client, clean_library):
    pdf = build_pdf(
        [
            "Ranjay Prajapati",
            "Bachelor of Engineering in Computer Science",
            "Skills: Python, FastAPI, SQL, React",
            "Experience: built retrieval augmented generation services",
        ],
        title="Ranjay CV",
    )
    response = upload(client, "cv.pdf", pdf, title="Ranjay CV")
    assert response.status_code == 200, response.text
    item = wait_for_status(client, response.json()["id"])
    assert item["status"] == "ready", item["error"]
    assert item["kind"] == "pdf"
    assert item["meta"]["pages"] == 1
    assert item["chunk_count"] >= 1

    search = client.post("/api/search", json={"query": "What qualifications do I have?"}).json()
    assert search["hits"], "the CV should be retrievable"
    assert search["hits"][0]["item_id"] == item["id"]
    assert search["hits"][0]["meta"].get("page") == 1

    events = sse_events(
        client.post("/api/chat", json={"message": "What skills are listed in my CV?"}).text
    )
    done = [e for e in events if e["type"] == "done"][0]
    citations = done["message"]["citations"]
    assert citations, "an answer from a source must carry a citation"
    assert citations[0]["item_id"] == item["id"]
    assert citations[0]["page"] == 1
    assert citations[0]["location"] == "page 1"
    assert "Python" in citations[0]["snippet"] or "FastAPI" in citations[0]["snippet"]


def test_corrupted_pdf_fails_with_a_useful_error(client, clean_library):
    response = upload(client, "broken.pdf", b"this is definitely not a pdf")
    assert response.status_code == 200
    item = wait_for_status(client, response.json()["id"])
    assert item["status"] == "failed"
    assert item["error"], "a failed item must explain itself"


# -------------------------------------------------------------------- images


def test_image_is_indexed_from_metadata_without_a_vision_key(client, clean_library):
    response = upload(client, "chart.png", build_png(64, 48), title="Quarterly chart", note="revenue by quarter")
    assert response.status_code == 200, response.text
    item = wait_for_status(client, response.json()["id"])
    assert item["status"] == "ready", item["error"]
    assert item["meta"]["width"] == 64
    assert item["meta"]["height"] == 48
    # Pillow found no EXIF block, and we say so instead of inventing values.
    assert item["meta"]["metadata"] == "not_recorded"
    # Vision is unavailable, and the reason names the variable to set.
    assert "OPENROUTER_API_KEY" in item["meta"]["vision_error"]

    hits = client.post("/api/search", json={"query": "quarterly revenue chart"}).json()["hits"]
    assert hits and hits[0]["item_id"] == item["id"]


def test_a_dead_end_names_the_files_that_could_not_be_read(client, clean_library):
    """The no-answer sentence alone is a dead end; say which files caused it."""
    response = upload(client, "marksheet.png", build_png(64, 48), title="Marksheet")
    assert response.status_code == 200, response.text
    item = wait_for_status(client, response.json()["id"])
    assert item["meta"]["vision_error"], "no key means the image is stored unread"
    vector.invalidate()

    events = sse_events(
        client.post("/api/chat", json={"message": "what is the capital of france"}).text
    )

    done = [e for e in events if e["type"] == "done"][0]
    assert done["message"]["content"] == NO_ANSWER
    assert done["message"]["citations"] == []

    notices = [e for e in events if e["type"] == "notice"]
    assert notices, "a dead end must explain that stored media could not be read"
    notice = notices[0]["notice"]
    assert "1 image file" in notice
    assert "OPENROUTER_API_KEY" in notice


def test_corrupted_image_fails_cleanly(client, clean_library):
    response = upload(client, "broken.png", b"\x89PNG\r\n\x1a\n not really an image")
    assert response.status_code == 200
    item = wait_for_status(client, response.json()["id"])
    assert item["status"] == "failed"
    assert item["error"]


def test_audio_without_a_key_explains_the_dependency(client, clean_library):
    response = upload(client, "meeting.mp3", b"ID3\x04\x00\x00\x00\x00\x00\x00fake")
    assert response.status_code == 200
    item = wait_for_status(client, response.json()["id"])
    assert item["status"] == "failed"
    assert "GROQ_API_KEY" in item["error"]


def test_video_without_a_key_explains_the_dependency(client, clean_library):
    response = upload(client, "clip.mp4", b"\x00\x00\x00\x18ftypmp42fake")
    assert response.status_code == 200
    item = wait_for_status(client, response.json()["id"])
    assert item["status"] == "failed"
    assert "GEMINI_API_KEY" in item["error"]


# ------------------------------------------------- validation and integrity


def test_unsupported_file_type_is_rejected(client):
    response = upload(client, "payload.exe", b"MZ\x90\x00")
    assert response.status_code == 415
    assert "Unsupported file type" in response.json()["detail"]


def test_empty_upload_is_rejected(client):
    response = upload(client, "empty.txt", b"")
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_missing_file_returns_404(client):
    assert client.get("/api/items/does-not-exist").status_code == 404
    assert client.get("/api/items/does-not-exist/file").status_code == 404


def test_reprocessing_does_not_duplicate_chunks(client, clean_library):
    item = client.post(
        "/api/items/text",
        json={"title": "Retry me", "content": "A single sentence that survives reprocessing."},
    ).json()
    first = item["chunk_count"]
    assert client.post(f"/api/items/{item['id']}/reprocess").status_code == 200
    after = wait_for_status(client, item["id"])
    assert after["chunk_count"] == first, "reprocessing must replace, not append"


def test_deleting_an_item_removes_it_from_retrieval(client, clean_library):
    item = client.post(
        "/api/items/text",
        json={"title": "Ephemeral", "content": "Obsolete fact about the Zorblax protocol."},
    ).json()
    vector.invalidate()
    assert client.post("/api/search", json={"query": "Zorblax protocol"}).json()["hits"]

    assert client.delete(f"/api/items/{item['id']}").status_code == 200
    vector.invalidate()

    assert client.post("/api/search", json={"query": "Zorblax protocol"}).json()["hits"] == []
    assert db.get_chunks(item["id"]) == [], "chunks must be deleted with their item"


def test_knowledge_survives_a_restart(client, clean_library):
    item = client.post(
        "/api/items/text",
        json={"title": "Persistent", "content": "The vault password hint is a blue heron."},
    ).json()

    # A brand new client re-runs the lifespan: this is what a restart looks like.
    from fastapi.testclient import TestClient

    from app.main import app
    from app import vector as vector_module

    with TestClient(app) as restarted:
        vector_module.invalidate()
        hits = restarted.post("/api/search", json={"query": "vault password hint"}).json()["hits"]
        assert hits, "previously indexed knowledge must still be retrievable"
        assert hits[0]["item_id"] == item["id"]


def test_conversation_history_is_persisted(client, clean_library):
    client.post(
        "/api/items/text",
        json={"title": "Topic", "content": "The release train leaves on the fourteenth."},
    )
    vector.invalidate()

    events = sse_events(client.post("/api/chat", json={"message": "When does the release train leave?"}).text)
    conversation_id = [e for e in events if e["type"] == "conversation"][0]["conversation_id"]

    stored = client.get(f"/api/conversations/{conversation_id}").json()
    assert [m["role"] for m in stored["messages"]] == ["user", "assistant"]
    assert stored["messages"][1]["citations"], "the answer should cite the note it used"


def test_item_ids_filter_restricts_retrieval(client, clean_library):
    keep = client.post(
        "/api/items/text",
        json={"title": "Kept", "content": "Saffron is the topic of this note."},
    ).json()
    other = client.post(
        "/api/items/text",
        json={"title": "Excluded", "content": "Saffron also appears in this unrelated note."},
    ).json()
    vector.invalidate()

    hits = client.post(
        "/api/search", json={"query": "saffron", "item_ids": [keep["id"]]}
    ).json()["hits"]
    assert hits
    assert {hit["item_id"] for hit in hits} == {keep["id"]}
    assert other["id"] not in {hit["item_id"] for hit in hits}


# ------------------------------------------------------------------- unit level


def test_strict_search_drops_chunks_that_share_no_words(client, clean_library):
    """The gate the offline extractive answer relies on."""
    from app import llm

    client.post(
        "/api/items/text",
        json={"title": "Gardening", "content": "Water the tomatoes every second morning."},
    )
    vector.invalidate()
    query_vec, _ = llm.embed_query("what is the capital of france")

    assert vector.search(query_vec, query_text="what is the capital of france", strict=True) == []
    # The same query without the gate still ranks the library for the LLM path.
    assert vector.search(query_vec, query_text="what is the capital of france", strict=False)


def test_chunking_never_merges_page_labels():
    long_a = "alpha " * 400
    long_b = "beta " * 400
    pairs = chunk_segments([(long_a, {"page": 1}), (long_b, {"page": 2})])

    pages = {meta["page"] for _, meta in pairs}
    assert pages == {1, 2}, "every chunk must keep the page it came from"
    for text, meta in pairs:
        if meta["page"] == 1:
            assert "beta" not in text
        else:
            assert "alpha" not in text


def test_timestamps_are_only_kept_when_the_model_emitted_them():
    from app.llm import _parse_timestamped

    segments = _parse_timestamped("## Transcript\n- [00:12] hello there\n- [01:30] goodbye")
    metas = [meta for _, meta in segments]
    # The heading becomes its own untimestamped segment; the spoken lines keep
    # the timestamps the model actually produced.
    assert {} in metas
    assert {"timestamp": "00:12"} in metas
    assert {"timestamp": "01:30"} in metas
    assert "[00:12] hello there" in " ".join(text for text, _ in segments)

    # A model that forgot the timestamps must not produce fabricated ones.
    plain = _parse_timestamped("Just a paragraph with no timestamps at all.")
    assert plain == [("Just a paragraph with no timestamps at all.", {})]


def test_openai_compatible_providers_use_configured_api_keys(monkeypatch):
    from app import llm

    monkeypatch.setattr(llm, "OPENROUTER_API_KEY", "openrouter-test-key")
    monkeypatch.setattr(llm, "GROQ_API_KEY", "groq-test-key")

    assert llm._openai_cfg("openrouter")["headers"]["Authorization"] == (
        "Bearer openrouter-test-key"
    )
    assert llm._openai_cfg("groq")["headers"]["Authorization"] == "Bearer groq-test-key"


def test_local_embeddings_are_deterministic():
    from app.llm import local_embed

    first = local_embed("retrieval augmented generation")
    second = local_embed("retrieval augmented generation")
    assert first == second
    assert len(first) == 768
    # Different text must not produce an identical vector.
    assert local_embed("entirely different words") != first
