import { useMemo, useState } from 'react'

import type { SynthesisPayload, Tone, Voice } from '../types'
import ProsodySlider from './ProsodySlider'

interface Props {
  voices: Voice[]
  tones: Tone[]
  submitting: boolean
  onSubmit: (payload: SynthesisPayload) => void
}

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'
const DEFAULT_TONE = 'natural'
const CUSTOM_TONE = 'custom'

export default function SynthesisPanel({ voices, tones, submitting, onSubmit }: Props) {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState(DEFAULT_VOICE)
  const [toneKey, setToneKey] = useState(DEFAULT_TONE)
  const [rate, setRate] = useState(0)
  const [volume, setVolume] = useState(0)
  const [pitch, setPitch] = useState(0)
  const [filter, setFilter] = useState('')

  const groupVoicesByLocale = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const groups = new Map<string, Voice[]>()
    for (const item of voices) {
      if (needle && !item.name.toLowerCase().includes(needle) && !item.locale.toLowerCase().includes(needle)) {
        continue
      }
      const list = groups.get(item.locale) ?? []
      list.push(item)
      groups.set(item.locale, list)
    }
    return [...groups.entries()]
  }, [voices, filter])

  // Batch mode treats every blank-line separated block as an independent job.
  const segments = useMemo(
    () => text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean),
    [text],
  )

  const trimmed = text.trim()
  const activeTone = tones.find((tone) => tone.key === toneKey)
  const canSubmit = !submitting && (mode === 'batch' ? segments.length > 0 : trimmed.length > 0)

  /** Apply a preset's prosody, or keep the current values for the custom tone. */
  function applyTone(tone: Tone) {
    setToneKey(tone.key)
    if (tone.key === CUSTOM_TONE) return
    setRate(tone.rate)
    setVolume(tone.volume)
    setPitch(tone.pitch)
  }

  /** Any manual adjustment moves the selection back to the custom tone. */
  function adjust(setter: (value: number) => void) {
    return (value: number) => {
      setter(value)
      setToneKey(CUSTOM_TONE)
    }
  }

  function handleSubmit() {
    if (!canSubmit) return
    const payload: SynthesisPayload = { voice, tone: toneKey, rate, volume, pitch }
    if (mode === 'batch') {
      payload.texts = segments
    } else {
      payload.text = trimmed
    }
    onSubmit(payload)
  }

  return (
    <section className="deck" aria-label="合成设置">
      <div className="switch" role="group" aria-label="合成模式">
        <button
          type="button"
          className={mode === 'single' ? 'switch__btn is-on' : 'switch__btn'}
          aria-pressed={mode === 'single'}
          onClick={() => setMode('single')}
        >
          单条
        </button>
        <button
          type="button"
          className={mode === 'batch' ? 'switch__btn is-on' : 'switch__btn'}
          aria-pressed={mode === 'batch'}
          onClick={() => setMode('batch')}
        >
          批量
        </button>
      </div>

      <label className="field">
        <span className="field__label">
          {mode === 'batch' ? '文本 — 空行分隔每一段' : '文本 — 长文本会自动分块'}
        </span>
        <textarea
          className="input input--area"
          value={text}
          rows={mode === 'batch' ? 7 : 9}
          placeholder={
            mode === 'batch'
              ? '第一段……\n\n第二段……\n\n第三段……'
              : '粘贴或输入要朗读的文本，长度不限。'
          }
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="field__meta">
        <span className="readout">
          {trimmed.length}
          <em>字</em>
        </span>
        {mode === 'batch' && (
          <span className="readout">
            {segments.length}
            <em>段</em>
          </span>
        )}
      </div>

      <fieldset className="field field--tone">
        <legend className="field__label">语气</legend>
        <div className="chips">
          {tones.map((tone) => (
            <button
              key={tone.key}
              type="button"
              className={tone.key === toneKey ? 'chip is-on' : 'chip'}
              aria-pressed={tone.key === toneKey}
              onClick={() => applyTone(tone)}
            >
              {tone.label}
            </button>
          ))}
        </div>
        <p className="tone__hint">{activeTone ? activeTone.hint : '选择一个语气，下面的参数会跟着调整。'}</p>
      </fieldset>

      <label className="field">
        <span className="field__label">音色 — 共 {voices.length} 个</span>
        <input
          className="input"
          value={filter}
          placeholder="筛选：zh-CN / Xiaoxiao / en-US"
          onChange={(event) => setFilter(event.target.value)}
        />
        <select className="input input--select" value={voice} onChange={(event) => setVoice(event.target.value)}>
          {groupVoicesByLocale.length === 0 && <option value={voice}>{voice}</option>}
          {groupVoicesByLocale.map(([locale, items]) => (
            <optgroup key={locale} label={locale}>
              {items.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.gender === 'Female' ? '女' : '男'} · {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="prosody">
        <ProsodySlider label="语速" value={rate} unit="%" min={-50} max={100} onChange={adjust(setRate)} />
        <ProsodySlider label="音量" value={volume} unit="%" min={-100} max={100} onChange={adjust(setVolume)} />
        <ProsodySlider label="音调" value={pitch} unit="Hz" min={-50} max={50} onChange={adjust(setPitch)} />
      </div>

      <button className="action" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting ? '提交中…' : mode === 'batch' ? `加入队列（${segments.length} 段）` : '生成语音'}
      </button>
    </section>
  )
}