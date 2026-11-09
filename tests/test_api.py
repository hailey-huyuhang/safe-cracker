import json

import pytest

from backend.app import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(dist_dir=tmp_path)  # empty dist: no frontend build needed
    app.testing = True
    return app.test_client()


def test_crack_safe_returns_attempts_and_time_taken(client):
    res = client.post("/api/crack_safe/", json={"actual_combination": "0800666666"})
    assert res.status_code == 200
    body = res.get_json()
    assert set(body) == {"attempts", "time_taken"}
    assert isinstance(body["attempts"], int) and body["attempts"] > 0
    assert isinstance(body["time_taken"], float) and body["time_taken"] >= 0


def test_trailing_slash_is_optional(client):
    res = client.post("/api/crack_safe", json={"actual_combination": "0800666666"})
    assert res.status_code == 200


@pytest.mark.parametrize(
    "payload, fragment",
    [
        ({}, "missing field"),
        ({"actual_combination": "123"}, "exactly 10 digits"),
        ({"actual_combination": "12345678901"}, "exactly 10 digits"),
        ({"actual_combination": "12345abcde"}, "exactly 10 digits"),
        ({"actual_combination": "１２３４５６７８９０"}, "exactly 10 digits"),
        ({"actual_combination": 1234567890}, "must be a string"),
        ([1, 2, 3], "JSON object"),
    ],
)
def test_rejects_bad_input(client, payload, fragment):
    res = client.post("/api/crack_safe/", json=payload)
    assert res.status_code == 400
    assert fragment in res.get_json()["error"]


def test_rejects_non_json_body(client):
    res = client.post("/api/crack_safe/", data="not json", content_type="text/plain")
    assert res.status_code == 400
    assert "JSON object" in res.get_json()["error"]


def test_wrong_method_is_json_error(client):
    res = client.get("/api/crack_safe/")
    assert res.status_code == 405
    assert "error" in res.get_json()


def test_unknown_api_route_is_json_404(client):
    res = client.get("/api/nope/")
    assert res.status_code == 404
    assert "error" in res.get_json()


def test_stream_reports_every_attempt_then_done(client):
    res = client.post(
        "/api/crack_safe/stream/",
        json={"actual_combination": "1234567890", "pace_ms": 0},
    )
    assert res.status_code == 200
    assert res.mimetype == "application/x-ndjson"
    events = [json.loads(line) for line in res.get_data(as_text=True).splitlines() if line]
    attempts = [e for e in events if e["event"] == "attempt"]
    done = events[-1]
    assert done["event"] == "done"
    assert set(done) == {"event", "attempts", "time_taken"}
    assert done["attempts"] == len(attempts)
    assert [e["attempt"] for e in attempts] == list(range(1, len(attempts) + 1))
    assert attempts[-1] == {"event": "attempt", "attempt": len(attempts), "guess": "1234567890", "matches": 10}
    plain = client.post("/api/crack_safe/", json={"actual_combination": "1234567890"}).get_json()
    assert plain["attempts"] == done["attempts"]


@pytest.mark.parametrize("pace", [-1, 5000, "fast", 1.5, True])
def test_stream_rejects_bad_pace(client, pace):
    res = client.post(
        "/api/crack_safe/stream/",
        json={"actual_combination": "1234567890", "pace_ms": pace},
    )
    assert res.status_code == 400
    assert "pace_ms" in res.get_json()["error"]


def test_health(client):
    assert client.get("/api/health/").get_json() == {"status": "ok"}


def test_index_explains_missing_frontend_build(client):
    res = client.get("/")
    assert res.status_code == 503
    assert b"npm run build" in res.data
