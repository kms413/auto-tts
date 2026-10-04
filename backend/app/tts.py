"""edge-tts integration: voice discovery and speech synthesis."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable
from pathlib import Path

import edge_tts

from . import config

ProgressCallback = Callable[[float], Awaitable[None]]

_voices_cache: list[dict] | None = None
_voices_lock = asyncio.Lock()

# Split on sentence terminators while keeping the terminator with the sentence.
_SENTENCE_BOUNDARY = re.compile(r"(?<=[。！？；!?;.\n])")


def format_rate(value: int) -> str:
    """Convert a percent delta into the edge-tts rate string."""
    return f"{value:+d}%"


def format_volume(value: int) -> str:
    """Convert a percent delta into the edge-tts volume string."""
    return f"{value:+d}%"


def format_pitch(value: int) -> str:
    """Convert a hertz delta into the edge-tts pitch string."""
    return f"{value:+d}Hz"


# Speaking-tone presets. edge-tts does not expose emotion styles, so every tone
# is approximated with a rate/volume/pitch delta triple that the frontend can
# apply to the prosody controls. Display names live in the frontend locale
# catalogues, keyed by the `key` below.
TONE_PRESETS: tuple[dict, ...] = (
    {"key": "natural", "rate": 0, "volume": 0, "pitch": 0},
    {"key": "gentle", "rate": -10, "volume": -6, "pitch": 4},
    {"key": "cheerful", "rate": 8, "volume": 4, "pitch": 8},
    {"key": "excited", "rate": 16, "volume": 8, "pitch": 14},
    {"key": "serious", "rate": -6, "volume": 2, "pitch": -8},
    {"key": "sad", "rate": -14, "volume": -8, "pitch": -6},
    {"key": "newscast", "rate": 6, "volume": 6, "pitch": -2},
    {"key": "whisper", "rate": -8, "volume": -40, "pitch": 2},
    {"key": "custom", "rate": 0, "volume": 0, "pitch": 0},
)

DEFAULT_TONE = "natural"


def list_tones() -> list[dict]:
    """Return the speaking-tone presets understood by the API."""
    return [dict(preset) for preset in TONE_PRESETS]


async def list_voices() -> list[dict]:
    """Return the edge-tts voice catalogue, cached for the process lifetime."""
    global _voices_cache
    async with _voices_lock:
        if _voices_cache is None:
            _voices_cache = await edge_tts.list_voices()
        return _voices_cache


def split_text(text: str, limit: int) -> list[str]:
    """Split *text* into chunks of at most *limit* characters on sentence boundaries."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    current = ""
    for sentence in _SENTENCE_BOUNDARY.split(text):
        if not sentence:
            continue
        if len(sentence) > limit:
            # A single sentence longer than the limit is hard-split.
            if current:
                chunks.append(current)
                current = ""
            for start in range(0, len(sentence), limit):
                chunks.append(sentence[start : start + limit])
            continue
        if len(current) + len(sentence) <= limit:
            current += sentence
        else:
            chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks


async def synthesize(
    text: str,
    voice: str,
    rate: str,
    volume: str,
    pitch: str,
    out_path: Path,
    on_progress: ProgressCallback | None = None,
) -> int:
    """Synthesise *text* into an mp3 file and return the number of audio bytes written."""
    chunks = split_text(text, config.CHUNK_SIZE)
    if not chunks:
        raise ValueError("Text must not be empty")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_name(f"{out_path.name}.part")
    total = len(chunks)
    written = 0
    try:
        with tmp_path.open("wb") as handle:
            for index, chunk in enumerate(chunks):
                communicate = edge_tts.Communicate(chunk, voice, rate=rate, volume=volume, pitch=pitch)
                async for message in communicate.stream():
                    if message["type"] == "audio":
                        handle.write(message["data"])
                        written += len(message["data"])
                if on_progress is not None:
                    await on_progress((index + 1) / total)
        tmp_path.replace(out_path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
    return written