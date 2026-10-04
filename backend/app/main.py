"""FastAPI application exposing the auto-tts HTTP API."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, tts
from .jobs import JobManager
from .schemas import JobView, SynthesisRequest

manager = JobManager(config.MAX_CONCURRENCY)


@asynccontextmanager
async def lifespan(_: FastAPI):
    config.ensure_dirs()
    await manager.start()
    yield
    await manager.stop()


app = FastAPI(title="auto-tts", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/api/voices")
async def voices() -> list[dict]:
    """Return the available voices, normalised for the frontend."""
    result = [
        {
            "name": voice["ShortName"],
            "locale": voice["Locale"],
            "gender": voice["Gender"],
            "friendly_name": voice.get("FriendlyName", voice["ShortName"]),
        }
        for voice in await tts.list_voices()
    ]
    result.sort(key=lambda item: (item["locale"], item["name"]))
    return result


@app.get("/api/tones")
async def tones() -> list[dict]:
    """Return the speaking-tone presets the frontend maps onto prosody."""
    return tts.list_tones()


@app.post("/api/jobs", response_model=list[JobView])
async def create_jobs(payload: SynthesisRequest) -> list[dict]:
    """Create one job per text (batch mode) or a single job for `text`."""
    texts = payload.texts if payload.texts else [payload.text]
    texts = [text for text in texts if text and text.strip()]
    if not texts:
        raise HTTPException(status_code=400, detail="No text provided")

    jobs = [
        await manager.submit(
            text,
            payload.voice,
            payload.tone,
            payload.rate,
            payload.volume,
            payload.pitch,
        )
        for text in texts
    ]
    return [job.to_dict() for job in jobs]


@app.get("/api/jobs", response_model=list[JobView])
async def list_jobs() -> list[dict]:
    return [job.to_dict() for job in await manager.list()]


@app.get("/api/jobs/{job_id}", response_model=JobView)
async def get_job(job_id: str) -> dict:
    job = await manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job.to_dict()


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str) -> dict:
    if not await manager.delete(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"deleted": job_id}


@app.get("/api/audio/{filename}")
async def get_audio(filename: str) -> FileResponse:
    if Path(filename).name != filename:
        raise HTTPException(status_code=404, detail="Audio not found")
    path = config.AUDIO_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(path, media_type="audio/mpeg", filename=filename)


# Serve the built frontend from the same origin so a single command can run the
# whole app on one port. Mounted last, so every /api route above takes priority.
if config.FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="frontend")