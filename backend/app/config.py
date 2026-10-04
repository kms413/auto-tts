"""Runtime configuration resolved from environment variables."""

from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = Path(os.getenv("AUTO_TTS_DATA_DIR", BASE_DIR / "data"))
AUDIO_DIR = DATA_DIR / "audio"

# Built frontend served by the backend in single-port mode. When the directory
# is missing the API still runs and the Vite dev server proxies to it instead.
FRONTEND_DIST = Path(os.getenv("AUTO_TTS_FRONTEND_DIST", PROJECT_DIR / "frontend" / "dist"))

# Number of synthesis jobs that may run in parallel.
MAX_CONCURRENCY = int(os.getenv("AUTO_TTS_MAX_CONCURRENCY", "2"))

# Long texts are split into chunks of at most this many characters before
# being sent to edge-tts, then concatenated back into a single audio file.
CHUNK_SIZE = int(os.getenv("AUTO_TTS_CHUNK_SIZE", "800"))

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