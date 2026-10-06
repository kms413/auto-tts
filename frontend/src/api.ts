import type { Job, JobMerge, SynthesisPayload, Tone, Voice } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = await response.json()
      detail = typeof body.detail === 'string' ? body.detail : detail
    } catch {
      // Keep the status text when the body is not JSON.
    }
    throw new Error(detail)
  }
  return (await response.json()) as T
}

export const fetchVoices = () => request<Voice[]>('/api/voices')

export const fetchTones = () => request<Tone[]>('/api/tones')

export const fetchJobs = () => request<Job[]>('/api/jobs')

export const createJobs = (payload: SynthesisPayload) =>
  request<Job[]>('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteJob = (id: string) =>
  request<{ deleted: string }>(`/api/jobs/${id}`, { method: 'DELETE' })

export const clearJobs = () => request<{ deleted: number }>('/api/jobs', { method: 'DELETE' })

export const mergeJobs = (ids: string[]) =>
  request<JobMerge>('/api/jobs/merge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })