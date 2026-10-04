import { useMemo, useState } from 'react'

import { Msg, useT } from '../i18n/t'
import { toneHintText, toneLabelText } from '../i18n/tones'
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
  const t = useT()
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
    <section className="deck" aria-label={t('panel.settings')}>
      <div className="switch" role="group" aria-label={t('panel.mode')}>
        <button
          type="button"
          className={mode === 'single' ? 'switch__btn is-on' : 'switch__btn'}
          aria-pressed={mode === 'single'}
          onClick={() => setMode('single')}
        >
          {t('panel.mode.single')}
        </button>
        <button
          type="button"
          className={mode === 'batch' ? 'switch__btn is-on' : 'switch__btn'}
          aria-pressed={mode === 'batch'}
          onClick={() => setMode('batch')}
        >
          {t('panel.mode.batch')}
        </button>
      </div>

      <label className="field">
        <span className="field__label">
          {mode === 'batch' ? t('panel.text.label.batch') : t('panel.text.label.single')}
        </span>
        <textarea
          className="input input--area"
          value={text}
          rows={mode === 'batch' ? 7 : 9}
          placeholder={
            mode === 'batch'
              ? t('panel.text.placeholder.batch')
              : t('panel.text.placeholder.single')
          }
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="field__meta">
        <span className="readout">
          <Msg id="panel.readout.chars" values={{ count: trimmed.length, em: (chunks) => <em>{chunks}</em> }} />
        </span>
        {mode === 'batch' && (
          <span className="readout">
            <Msg id="panel.readout.segments" values={{ count: segments.length, em: (chunks) => <em>{chunks}</em> }} />
          </span>
        )}
      </div>

      <fieldset className="field field--tone">
        <legend className="field__label">{t('panel.tone.legend')}</legend>
        <div className="chips">
          {tones.map((tone) => (
            <button
              key={tone.key}
              type="button"
              className={tone.key === toneKey ? 'chip is-on' : 'chip'}
              aria-pressed={tone.key === toneKey}
              onClick={() => applyTone(tone)}
            >
              {toneLabelText(t, tone.key)}
            </button>
          ))}
        </div>
        <p className="tone__hint">{activeTone ? toneHintText(t, activeTone.key) : t('panel.tone.hintFallback')}</p>
      </fieldset>

      <label className="field">
        <span className="field__label">{t('panel.voice.label', { count: voices.length })}</span>
        <input
          className="input"
          value={filter}
          placeholder={t('panel.voice.filter')}
          onChange={(event) => setFilter(event.target.value)}
        />
        <select className="input input--select" value={voice} onChange={(event) => setVoice(event.target.value)}>
          {groupVoicesByLocale.length === 0 && <option value={voice}>{voice}</option>}
          {groupVoicesByLocale.map(([locale, items]) => (
            <optgroup key={locale} label={locale}>
              {items.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.gender === 'Female' ? t('voice.female') : t('voice.male')} · {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="prosody">
        <ProsodySlider id="rate" label={t('panel.prosody.rate')} value={rate} unit="%" min={-50} max={100} onChange={adjust(setRate)} />
        <ProsodySlider id="volume" label={t('panel.prosody.volume')} value={volume} unit="%" min={-100} max={100} onChange={adjust(setVolume)} />
        <ProsodySlider id="pitch" label={t('panel.prosody.pitch')} value={pitch} unit="Hz" min={-50} max={50} onChange={adjust(setPitch)} />
      </div>

      <button className="action" disabled={!canSubmit} onClick={handleSubmit}>
        {submitting
          ? t('panel.submit.busy')
          : mode === 'batch'
            ? t('panel.submit.batch', { count: segments.length })
            : t('panel.submit.single')}
      </button>
    </section>
  )
}