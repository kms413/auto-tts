import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createJobs, deleteJob, fetchJobs, fetchTones, fetchVoices } from './api'
import JobList from './components/JobList'
import LocaleSwitch from './components/LocaleSwitch'
import SynthesisPanel from './components/SynthesisPanel'
import Waveform from './components/Waveform'
import { Msg, useT } from './i18n/t'
import type { Job, SynthesisPayload, Tone, Voice } from './types'

const POLL_INTERVAL_MS = 1500

export default function App() {
  const [voices, setVoices] = useState<Voice[]>([])
  const [tones, setTones] = useState<Tone[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const loaded = useRef(false)
  const t = useT()

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await fetchJobs())
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true
    fetchVoices()
      .then(setVoices)
      .catch((err) => setError((err as Error).message))
    fetchTones()
      .then(setTones)
      .catch((err) => setError((err as Error).message))
  }, [])

  useEffect(() => {
    void refreshJobs()
    const timer = window.setInterval(refreshJobs, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refreshJobs])

  const handleSubmit = useCallback(
    async (payload: SynthesisPayload) => {
      setSubmitting(true)
      try {
        await createJobs(payload)
        setError(null)
        await refreshJobs()
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setSubmitting(false)
      }
    },
    [refreshJobs],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteJob(id)
        await refreshJobs()
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [refreshJobs],
  )

  const stats = useMemo(() => {
    let live = 0
    let done = 0
    let failed = 0
    for (const job of jobs) {
      if (job.status === 'pending' || job.status === 'processing') live += 1
      else if (job.status === 'completed') done += 1
      else if (job.status === 'failed') failed += 1
    }
    return { live, done, failed }
  }, [jobs])

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead__row">
          <h1 className="wordmark">auto-tts</h1>
          <div className="masthead__aside">
            <LocaleSwitch />
            <dl className="meters">
              <div className="meter">
                <dt>{t('app.tonesAvailable')}</dt>
                <dd>{voices.length}</dd>
              </div>
              <div className="meter">
                <dt>{t('app.live')}</dt>
                <dd>{stats.live}</dd>
              </div>
              <div className="meter">
                <dt>{t('app.done')}</dt>
                <dd>{stats.done}</dd>
              </div>
              {stats.failed > 0 && (
                <div className="meter meter--alert">
                  <dt>{t('app.failed')}</dt>
                  <dd>{stats.failed}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
        <Waveform variant="hero" barCount={64} />
        <p className="masthead__lede">
          <Msg id="app.lede" />
        </p>
      </header>

      {error && (
        <div className="alert" role="alert">
          <span className="alert__text">{error}</span>
          <button className="alert__dismiss" onClick={() => setError(null)}>
            {t('app.dismiss')}
          </button>
        </div>
      )}

      <main className="workbench">
        <SynthesisPanel voices={voices} tones={tones} submitting={submitting} onSubmit={handleSubmit} />

        <section className="queue" aria-label={t('app.queue')}>
          <div className="queue__head">
            <h2 className="queue__title">{t('app.queue')}</h2>
            <span className="readout">
              <Msg id="app.queue.countUnit" values={{ count: jobs.length, em: (chunks) => <em>{chunks}</em> }} />
            </span>
          </div>
          <JobList jobs={jobs} onDelete={handleDelete} />
        </section>
      </main>

      {/* Section 13 of the AGPL asks network-interactive programs to expose
          their source, so this link stays in the interface. */}
      <footer className="colophon">
        <span className="colophon__license">{t('app.license')}</span>
        <a
          className="colophon__link"
          href="https://github.com/kms413/auto-tts"
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('app.source')}
        </a>
      </footer>
    </div>
  )
}