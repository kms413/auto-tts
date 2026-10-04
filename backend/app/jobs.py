"""In-memory job queue that drives edge-tts synthesis."""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field

from . import config, tts


@dataclass
class Job:
    """A single text-to-speech task."""

    id: str
    text: str
    voice: str
    tone: str
    rate: int
    volume: int
    pitch: int
    status: str = "pending"
    progress: float = 0.0
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None
    size_bytes: int = 0

    @property
    def filename(self) -> str:
        return f"{self.id}.mp3"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "text": self.text,
            "voice": self.voice,
            "tone": self.tone,
            "tone_label": tts.tone_label(self.tone),
            "rate": self.rate,
            "volume": self.volume,
            "pitch": self.pitch,
            "status": self.status,
            "progress": round(self.progress, 3),
            "error": self.error,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "size_bytes": self.size_bytes,
            "chars": len(self.text),
            "audio_url": f"/api/audio/{self.filename}" if self.status == "completed" else None,
        }


class JobManager:
    """Queue and worker pool that turns jobs into audio files."""

    def __init__(self, concurrency: int) -> None:
        self._concurrency = max(1, concurrency)
        self._jobs: dict[str, Job] = {}
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._workers: list[asyncio.Task] = []
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        self._workers = [asyncio.create_task(self._worker()) for _ in range(self._concurrency)]

    async def stop(self) -> None:
        for worker in self._workers:
            worker.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers = []

    async def submit(self, text: str, voice: str, tone: str, rate: int, volume: int, pitch: int) -> Job:
        job = Job(
            id=uuid.uuid4().hex,
            text=text,
            voice=voice,
            tone=tone,
            rate=rate,
            volume=volume,
            pitch=pitch,
        )
        async with self._lock:
            self._jobs[job.id] = job
        await self._queue.put(job.id)
        return job

    async def list(self) -> list[Job]:
        async with self._lock:
            return sorted(self._jobs.values(), key=lambda job: job.created_at, reverse=True)

    async def get(self, job_id: str) -> Job | None:
        async with self._lock:
            return self._jobs.get(job_id)

    async def delete(self, job_id: str) -> bool:
        async with self._lock:
            job = self._jobs.pop(job_id, None)
        if job is None:
            return False
        (config.AUDIO_DIR / job.filename).unlink(missing_ok=True)
        return True

    async def _worker(self) -> None:
        while True:
            job_id = await self._queue.get()
            try:
                job = await self.get(job_id)
                if job is None:
                    continue
                await self._run(job)
            finally:
                self._queue.task_done()

    async def _run(self, job: Job) -> None:
        job.status = "processing"

        async def on_progress(value: float) -> None:
            job.progress = value

        try:
            size = await tts.synthesize(
                job.text,
                job.voice,
                tts.format_rate(job.rate),
                tts.format_volume(job.volume),
                tts.format_pitch(job.pitch),
                config.AUDIO_DIR / job.filename,
                on_progress,
            )
            job.size_bytes = size
            job.progress = 1.0
            job.status = "completed"
        except asyncio.CancelledError:
            job.status = "failed"
            job.error = "cancelled"
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced to the client via job.error
            job.status = "failed"
            job.error = str(exc) or exc.__class__.__name__
        finally:
            job.finished_at = time.time()