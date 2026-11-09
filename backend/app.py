"""Flask service for the Part 1 safe cracker.

Endpoints
---------
POST /api/crack_safe/         -> {"attempts": int, "time_taken": float}
POST /api/crack_safe/stream/  -> NDJSON stream: one line per sound-tool call,
                                 ending with a "done" line that carries the
                                 same two fields as /api/crack_safe/
GET  /api/health/             -> {"status": "ok"}
GET  /                        -> the built Angular app (frontend/dist)
"""

from __future__ import annotations

import json
import os
import queue
import re
import threading
import time
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.routing import PathConverter

from .cracker import crack_safe

COMBINATION_RE = re.compile(r"[0-9]{10}")
DEFAULT_PACE_MS = 40
MAX_PACE_MS = 1000
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def parse_combination(payload):
    """Validate a request body; return ``(combination, error_message)``."""
    if not isinstance(payload, dict):
        return None, "request body must be a JSON object"
    if "actual_combination" not in payload:
        return None, "missing field 'actual_combination'"
    value = payload["actual_combination"]
    if not isinstance(value, str):
        return None, "'actual_combination' must be a string"
    if not COMBINATION_RE.fullmatch(value):
        return None, "'actual_combination' must be exactly 10 digits (0-9)"
    return value, None


def parse_pace_ms(payload):
    """Validate the optional ``pace_ms`` field of the stream endpoint."""
    value = payload.get("pace_ms", DEFAULT_PACE_MS)
    if isinstance(value, bool) or not isinstance(value, int):
        return None, "'pace_ms' must be an integer"
    if not 0 <= value <= MAX_PACE_MS:
        return None, f"'pace_ms' must be between 0 and {MAX_PACE_MS}"
    return value, None


def stream_events(combination: str, pace_seconds: float):
    """Yield one NDJSON line per sound-tool call while the solver runs.

    The solver runs in a worker thread and reports every probe through its
    ``on_guess`` hook; this generator forwards the events to the client as
    they arrive.  The solver finishes in microseconds, so delivery is paced
    (``pace_seconds`` between lines) to keep the attempt counter visible in a
    UI.  ``time_taken`` in the final line is the solver's own measurement and
    is not affected by the pacing.
    """
    events: queue.Queue = queue.Queue()

    def worker():
        try:
            attempts, time_taken = crack_safe(
                combination,
                lambda guess, matches: events.put(("attempt", guess, matches)),
            )
        except Exception as exc:  # defensive: report instead of hanging the stream
            events.put(("error", str(exc), None))
        else:
            events.put(("done", attempts, time_taken))

    threading.Thread(target=worker, daemon=True).start()

    attempt = 0
    while True:
        kind, first, second = events.get()
        if kind == "attempt":
            attempt += 1
            yield _line(event="attempt", attempt=attempt, guess=first, matches=second)
            if pace_seconds:
                time.sleep(pace_seconds)
        elif kind == "done":
            yield _line(event="done", attempts=first, time_taken=second)
            return
        else:
            yield _line(event="error", message=first)
            return


def _line(**fields) -> str:
    return json.dumps(fields) + "\n"


class AssetPath(PathConverter):
    """A ``path`` URL converter that never matches ``/api/...``.

    The built frontend is served from ``/<asset:filename>``; excluding the API
    prefix means unknown or wrongly-used API URLs get proper JSON 404/405
    answers instead of a static-file lookup.
    """

    regex = r"(?!api(?:/|$))[^/].*?"


def create_app(dist_dir: Path | str | None = None) -> Flask:
    """Application factory. ``dist_dir`` points at the built Angular app."""
    dist = Path(dist_dir) if dist_dir else DIST_DIR
    app = Flask(__name__, static_folder=None)
    app.url_map.strict_slashes = False  # /api/crack_safe and /api/crack_safe/ both work
    app.url_map.converters["asset"] = AssetPath

    @app.get("/api/health/")
    def health():
        return jsonify(status="ok")

    @app.post("/api/crack_safe/")
    def crack_safe_endpoint():
        combination, error = parse_combination(request.get_json(silent=True))
        if error:
            return jsonify(error=error), 400
        attempts, time_taken = crack_safe(combination)
        return jsonify(attempts=attempts, time_taken=time_taken)

    @app.post("/api/crack_safe/stream/")
    def crack_safe_stream_endpoint():
        payload = request.get_json(silent=True)
        combination, error = parse_combination(payload)
        if error:
            return jsonify(error=error), 400
        pace_ms, error = parse_pace_ms(payload)
        if error:
            return jsonify(error=error), 400
        return Response(
            stream_events(combination, pace_ms / 1000),
            mimetype="application/x-ndjson",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/")
    def index():
        if not (dist / "index.html").exists():
            return (
                "Frontend build not found. Run `npm run build` inside frontend/ "
                "(see README), or call the API directly at /api/crack_safe/.",
                503,
                {"Content-Type": "text/plain; charset=utf-8"},
            )
        return send_from_directory(dist, "index.html")

    @app.get("/<asset:filename>")
    def assets(filename: str):
        return send_from_directory(dist, filename)

    @app.errorhandler(HTTPException)
    def api_errors_as_json(error: HTTPException):
        if request.path == "/api" or request.path.startswith("/api/"):
            return jsonify(error=error.description), error.code
        return error

    return app


app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        debug=False,
        threaded=True,
    )
