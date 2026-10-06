export interface Voice {
  name: string
  locale: string
  gender: string
  friendly_name: string
}

export interface Tone {
  key: string
  rate: number
  volume: number
  pitch: number
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface Job {
  id: string
  text: string
  voice: string
  tone: string
  rate: number
  volume: number
  pitch: number
  status: JobStatus
  progress: number
  error: string | null
  created_at: number
  finished_at: number | null
  size_bytes: number
  chars: number
  audio_url: string | null
  srt_url: string | null
}

export interface SynthesisPayload {
  text?: string
  texts?: string[]
  voice: string
  tone: string
  rate: number
  volume: number
  pitch: number
}

export interface JobMerge {
  id: string
  count: number
  size_bytes: number
  duration: number
  audio_url: string
  srt_url: string | null
}