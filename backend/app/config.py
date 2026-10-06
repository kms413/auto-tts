"""Runtime configuration resolved from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = Path(os.getenv("AUTO_TTS_DATA_DIR", BASE_DIR / "data"))
AUDIO_DIR = DATA_DIR / "audio"

# Job metadata is written here so the queue survives a restart. The audio files
# themselves live in AUDIO_DIR and are left in place.
JOBS_FILE = DATA_DIR / "jobs.json"

# Built frontend served by the backend in single-port mode. When the directory
# is missing the API still runs and the Vite dev server proxies to it instead.
FRONTEND_DIST = Path(os.getenv("AUTO_TTS_FRONTEND_DIST", PROJECT_DIR / "frontend" / "dist"))

# Number of synthesis jobs that may run in parallel. edge-tts synthesis is
# network bound, so several jobs can stream from the service at once.
MAX_CONCURRENCY = int(os.getenv("AUTO_TTS_MAX_CONCURRENCY", "4"))

# Long texts are split into chunks of at most this many characters before
# being sent to edge-tts, then concatenated back into a single audio file.
CHUNK_SIZE = int(os.getenv("AUTO_TTS_CHUNK_SIZE", "800"))

# Chunks of one text are independent streams, so they are synthesised in
# parallel and concatenated in order. This caps how many run at once per job,
# which keeps a single long text from monopolising the connection pool.
CHUNK_CONCURRENCY = int(os.getenv("AUTO_TTS_CHUNK_CONCURRENCY", "4"))

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "AUTO_TTS_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]


def ensure_dirs() -> None:
    """Create the directories required at runtime."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)