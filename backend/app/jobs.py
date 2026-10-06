"""Job queue that drives edge-tts synthesis and survives process restarts."""

from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from . import config, tts

# edge-tts streams 48 kbps CBR mono mp3, so a merged timeline can be derived
# from byte offsets: one second of audio is 6000 bytes, i.e. one millisecond is
# six bytes. The same constant is used when merging subtitles onto the audio.
_BYTES_PER_MS = 6

# Timestamps inside an SRT cue line: "HH:MM:SS,mmm".
_SRT_TIMESTAMP = re.compile(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})")


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
    has_subtitles: bool = False

    @property
    def filename(self) -> str:
        return f"{self.id}.mp3"

    @property
    def srt_filename(self) -> str:
        return f"{self.id}.srt"

    def to_record(self) -> dict[str, Any]:
        """Return the fields persisted to disk (no derived URLs)."""
        return {
            "id": self.id,
            "text": self.text,
            "voice": self.voice,
            "tone": self.tone,
            "rate": self.rate,
            "volume": self.volume,
            "pitch": self.pitch,
            "status": self.status,
            "progress": self.progress,
            "error": self.error,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
            "size_bytes": self.size_bytes,
            "has_subtitles": self.has_subtitles,
        }

    @classmethod
    def from_record(cls, data: dict[str, Any]) -> "Job":
        """Rebuild a job from a persisted record, tolerating missing fields."""
        finished_at = data.get("finished_at")
        return cls(
            id=str(data.get("id", uuid.uuid4().hex)),
            text=str(data.get("text", "")),
            voice=str(data.get("voice", "")),
            tone=str(data.get("tone", tts.DEFAULT_TONE)),
            rate=int(data.get("rate", 0)),
            volume=int(data.get("volume", 0)),
            pitch=int(data.get("pitch", 0)),
            status=str(data.get("status", "failed")),
            progress=float(data.get("progress", 0.0)),
            error=data.get("error"),
            created_at=float(data.get("created_at", time.time())),
            finished_at=float(finished_at) if finished_at is not None else None,
            size_bytes=int(data.get("size_bytes", 0)),
            has_subtitles=bool(data.get("has_subtitles", False)),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "text": self.text,
            "voice": self.voice,
            "tone": self.tone,
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
            "srt_url": (
                f"/api/subtitles/{self.srt_filename}"
                if self.status == "completed" and self.has_subtitles
                else None
            ),
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
        # Restore the previous queue before any worker can pick up new work.
        self._load()
        self._purge_merged_files()
        self._workers = [asyncio.create_task(self._worker()) for _ in range(self._concurrency)]

    async def stop(self) -> None:
        for worker in self._workers:
            worker.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers = []
        self._persist()

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
        self._persist()
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
        self._remove_files(job)
        self._persist()
        return True

    async def clear(self) -> int:
        """Delete every job and its audio, returning how many were removed."""
        async with self._lock:
            jobs = list(self._jobs.values())
            self._jobs.clear()
        for job in jobs:
            self._remove_files(job)
        # Merged artifacts are derived from the jobs that just went away.
        self._purge_merged_files()
        self._persist()
        return len(jobs)

    async def merge(self, job_ids: list[str]) -> dict[str, Any]:
        """Concatenate the selected completed jobs into one mp3 plus one srt.

        Audio is merged by appending the raw mp3 streams (edge-tts emits 48 kbps
        CBR, so this keeps a single continuous timeline). Subtitle cues from each
        job are shifted by the duration of the audio that precedes them.
        """
        async with self._lock:
            selected = [self._jobs[job_id] for job_id in job_ids if job_id in self._jobs]

        selected = [
            job
            for job in selected
            if job.status == "completed" and (config.AUDIO_DIR / job.filename).is_file()
        ]
        if not selected:
            raise ValueError("Select at least one completed job")

        merged_id = f"merged-{uuid.uuid4().hex[:12]}"
        audio_name = f"{merged_id}.mp3"
        srt_name = f"{merged_id}.srt"
        audio_path = config.AUDIO_DIR / audio_name
        srt_path = config.AUDIO_DIR / srt_name

        cues: list[tuple[int, int, str]] = []
        total_bytes = 0
        with audio_path.open("wb") as handle:
            for job in selected:
                data = (config.AUDIO_DIR / job.filename).read_bytes()
                handle.write(data)
                # Offset the cues by the audio written so far, then grow it.
                offset_ms = total_bytes // _BYTES_PER_MS
                source = config.AUDIO_DIR / job.srt_filename
                if source.is_file():
                    cues.extend(
                        (start + offset_ms, end + offset_ms, text)
                        for start, end, text in _parse_srt(source.read_text(encoding="utf-8"))
                    )
                total_bytes += len(data)

        has_subtitles = bool(cues)
        if has_subtitles:
            srt_path.write_text(_render_srt(cues), encoding="utf-8")

        return {
            "id": merged_id,
            "count": len(selected),
            "size_bytes": total_bytes,
            "duration": round(total_bytes / (_BYTES_PER_MS * 1000), 1),
            "audio_url": f"/api/audio/{audio_name}",
            "srt_url": f"/api/subtitles/{srt_name}" if has_subtitles else None,
        }

    def _remove_files(self, job: Job) -> None:
        (config.AUDIO_DIR / job.filename).unlink(missing_ok=True)
        (config.AUDIO_DIR / job.srt_filename).unlink(missing_ok=True)

    # --------------------------------------------------------------- persistence

    def _load(self) -> None:
        """Restore jobs written by a previous run, repairing unusable entries."""
        path = config.JOBS_FILE
        if not path.is_file():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        if not isinstance(payload, list):
            return

        changed = False
        for record in payload:
            if not isinstance(record, dict):
                continue
            job = Job.from_record(record)
            # The queue itself is not persisted, so anything still pending or
            # running when the process stopped can never finish.
            if job.status in ("pending", "processing"):
                job.status = "failed"
                job.error = "Interrupted by restart"
                job.finished_at = job.finished_at or time.time()
                changed = True
            elif job.status == "completed" and not (config.AUDIO_DIR / job.filename).is_file():
                job.status = "failed"
                job.error = "Audio file is missing"
                job.size_bytes = 0
                job.has_subtitles = False
                job.finished_at = job.finished_at or time.time()
                changed = True
            self._jobs[job.id] = job

        if changed:
            self._persist()

    def _persist(self) -> None:
        """Write the current queue to disk. Synchronous on purpose: no await
        point means no other coroutine can mutate the queue mid-write."""
        records = [job.to_record() for job in self._jobs.values()]
        path = config.JOBS_FILE
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_name(f"{path.name}.part")
        tmp_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(path)

    def _purge_merged_files(self) -> None:
        """Drop merged artifacts from a previous run; they are cheap to rebuild."""
        for path in config.AUDIO_DIR.glob("merged-*"):
            path.unlink(missing_ok=True)

    # -------------------------------------------------------------------- workers

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

        srt_path = config.AUDIO_DIR / job.srt_filename
        try:
            size = await tts.synthesize(
                job.text,
                job.voice,
                tts.format_rate(job.rate),
                tts.format_volume(job.volume),
                tts.format_pitch(job.pitch),
                config.AUDIO_DIR / job.filename,
                srt_path=srt_path,
                on_progress=on_progress,
            )
            job.size_bytes = size
            job.has_subtitles = srt_path.is_file()
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
            self._persist()


# --------------------------------------------------------------------- subtitles


def _parse_srt(text: str) -> list[tuple[int, int, str]]:
    """Parse SRT text into (start_ms, end_ms, payload) cues."""
    cues: list[tuple[int, int, str]] = []
    for block in re.split(r"\r?\n\s*\r?\n", text.strip()):
        lines = [line for line in block.splitlines() if line.strip()]
        timing_index = next((index for index, line in enumerate(lines) if "-->" in line), None)
        if timing_index is None:
            continue
        stamps = _SRT_TIMESTAMP.findall(lines[timing_index])
        if len(stamps) < 2:
            continue
        payload = "\n".join(lines[timing_index + 1 :]).strip()
        if not payload:
            continue
        cues.append((_to_ms(stamps[0]), _to_ms(stamps[1]), payload))
    return cues


def _render_srt(cues: list[tuple[int, int, str]]) -> str:
    """Render cues back to SRT, renumbering from one."""
    blocks = [
        f"{index}\n{_format_ms(start)} --> {_format_ms(end)}\n{text}\n"
        for index, (start, end, text) in enumerate(cues, start=1)
    ]
    return "\n".join(blocks)


def _to_ms(parts: tuple[str, str, str, str]) -> int:
    hours, minutes, seconds, millis = (int(part) for part in parts)
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis


def _format_ms(value: int) -> str:
    millis = value % 1000
    total_seconds = value // 1000
    seconds = total_seconds % 60
    minutes = (total_seconds // 60) % 60
    hours = total_seconds // 3600
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"