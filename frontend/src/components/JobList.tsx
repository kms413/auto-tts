import { useIntl } from 'react-intl'

import type { MessageId } from '../i18n/messages/zh-CN'
import { Msg, useT } from '../i18n/t'
import { toneLabelText } from '../i18n/tones'
import type { Job, JobStatus } from '../types'
import Waveform from './Waveform'

interface Props {
  jobs: Job[]
  onDelete: (id: string) => void
}

const STATUS_ID: Record<JobStatus, MessageId> = {
  pending: 'job.status.pending',
  processing: 'job.status.processing',
  completed: 'job.status.completed',
  failed: 'job.status.failed',
}

function signed(value: number, unit: string) {
  return `${value > 0 ? '+' : ''}${value}${unit}`
}

export default function JobList({ jobs, onDelete }: Props) {
  const intl = useIntl()
  const t = useT()

  if (jobs.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">
          <Msg id="job.empty.title" />
        </p>
        <p className="empty__hint">
          <Msg id="job.empty.hint" />
        </p>
      </div>
    )
  }

  function formatSize(bytes: number) {
    if (!bytes) return t('job.size.dash')
    return bytes > 1024 * 1024
      ? t('job.size.mb', { value: (bytes / 1024 / 1024).toFixed(2) })
      : t('job.size.kb', { value: (bytes / 1024).toFixed(1) })
  }

  return (
    <ol className="takes">
      {jobs.map((job, index) => {
        const duration = job.finished_at ? (job.finished_at - job.created_at).toFixed(1) : null
        const live = job.status === 'pending' || job.status === 'processing'

        return (
          <li key={job.id} className={`take take--${job.status}`}>
            <div className="take__head">
              <span className="take__index">{String(index + 1).padStart(2, '0')}</span>
              <span className={`take__status take__status--${job.status}`}>{t(STATUS_ID[job.status])}</span>
              <span className="take__voice" title={job.voice}>
                {job.voice}
              </span>
              <button className="take__remove" onClick={() => onDelete(job.id)}>
                {t('job.remove')}
              </button>
            </div>

            <p className="take__text">{job.text}</p>

            <dl className="take__spec">
              <div>
                <dt>{t('job.spec.tone')}</dt>
                <dd>{toneLabelText(t, job.tone)}</dd>
              </div>
              <div>
                <dt>{t('job.spec.rate')}</dt>
                <dd>{signed(job.rate, '%')}</dd>
              </div>
              <div>
                <dt>{t('job.spec.pitch')}</dt>
                <dd>{signed(job.pitch, 'Hz')}</dd>
              </div>
              <div>
                <dt>{t('job.spec.chars')}</dt>
                <dd>{job.chars}</dd>
              </div>
              <div>
                <dt>{t('job.spec.size')}</dt>
                <dd>{formatSize(job.size_bytes)}</dd>
              </div>
              <div>
                <dt>{t('job.spec.submitted')}</dt>
                <dd>{intl.formatTime(new Date(job.created_at * 1000))}</dd>
              </div>
              {duration && (
                <div>
                  <dt>{t('job.spec.duration')}</dt>
                  <dd>{t('job.duration', { value: duration })}</dd>
                </div>
              )}
            </dl>

            {live && <Waveform variant="strip" barCount={44} progress={job.progress} active seed={index + 11} />}

            {job.status === 'failed' && job.error && <p className="take__error">{job.error}</p>}

            {job.status === 'completed' && job.audio_url && (
              <div className="take__play">
                <audio controls preload="metadata" src={job.audio_url} />
                <a className="take__download" href={job.audio_url} download={`${job.id}.mp3`}>
                  {t('job.download')}
                </a>
                {job.srt_url && (
                  <a className="take__download" href={job.srt_url} download={`${job.id}.srt`}>
                    {t('job.downloadSrt')}
                  </a>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}