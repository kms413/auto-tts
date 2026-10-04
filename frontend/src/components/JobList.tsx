import type { Job, JobStatus } from '../types'
import Waveform from './Waveform'

interface Props {
  jobs: Job[]
  onDelete: (id: string) => void
}

const STATUS_TEXT: Record<JobStatus, string> = {
  pending: '排队中',
  processing: '合成中',
  completed: '已完成',
  failed: '失败',
}

function signed(value: number, unit: string) {
  return `${value > 0 ? '+' : ''}${value}${unit}`
}

function formatSize(bytes: number) {
  if (!bytes) return '—'
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

function formatClock(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleTimeString('zh-CN', { hour12: false })
}

export default function JobList({ jobs, onDelete }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">队列还是空的</p>
        <p className="empty__hint">在左边粘贴文本，选好音色和语气，点「生成语音」后音频会出现在这里。</p>
      </div>
    )
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
              <span className={`take__status take__status--${job.status}`}>{STATUS_TEXT[job.status]}</span>
              <span className="take__voice" title={job.voice}>
                {job.voice}
              </span>
              <button className="take__remove" onClick={() => onDelete(job.id)}>
                删除
              </button>
            </div>

            <p className="take__text">{job.text}</p>

            <dl className="take__spec">
              <div>
                <dt>语气</dt>
                <dd>{job.tone_label}</dd>
              </div>
              <div>
                <dt>语速</dt>
                <dd>{signed(job.rate, '%')}</dd>
              </div>
              <div>
                <dt>音调</dt>
                <dd>{signed(job.pitch, 'Hz')}</dd>
              </div>
              <div>
                <dt>字数</dt>
                <dd>{job.chars}</dd>
              </div>
              <div>
                <dt>大小</dt>
                <dd>{formatSize(job.size_bytes)}</dd>
              </div>
              <div>
                <dt>提交</dt>
                <dd>{formatClock(job.created_at)}</dd>
              </div>
              {duration && (
                <div>
                  <dt>耗时</dt>
                  <dd>{duration}s</dd>
                </div>
              )}
            </dl>

            {live && <Waveform variant="strip" barCount={44} progress={job.progress} active seed={index + 11} />}

            {job.status === 'failed' && job.error && <p className="take__error">{job.error}</p>}

            {job.status === 'completed' && job.audio_url && (
              <div className="take__play">
                <audio controls preload="none" src={job.audio_url} />
                <a className="take__download" href={job.audio_url} download={`${job.id}.mp3`}>
                  下载 MP3
                </a>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}