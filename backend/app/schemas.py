"""Pydantic schemas shared by the auto-tts HTTP API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SynthesisRequest(BaseModel):
    """Payload used to create one or more synthesis jobs."""

    text: str = Field(default="", description="Single text to synthesise.")
    texts: list[str] | None = Field(
        default=None,
        description="Batch of texts; when present it takes precedence over `text`.",
    )
    voice: str = Field(..., description="edge-tts voice short name.")
    tone: str = Field(default="natural", description="Speaking-tone preset key.")
    rate: int = Field(default=0, ge=-100, le=200, description="Speaking rate delta, percent.")
    volume: int = Field(default=0, ge=-100, le=100, description="Volume delta, percent.")
    pitch: int = Field(default=0, ge=-100, le=100, description="Pitch delta, Hz.")


class MergeRequest(BaseModel):
    """Identifiers of completed jobs to concatenate, in the requested order."""

    ids: list[str] = Field(default_factory=list, description="Job ids to merge.")


class JobView(BaseModel):
    """Serialised view of a synthesis job."""

    id: str
    text: str
    voice: str
    tone: str
    rate: int
    volume: int
    pitch: int
    status: str
    progress: float
    error: str | None = None
    created_at: float
    finished_at: float | None = None
    size_bytes: int
    chars: int
    audio_url: str | None = None
    srt_url: str | None = None