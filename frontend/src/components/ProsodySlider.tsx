interface Props {
  /** Stable id used for the input/output pairing, independent of the label. */
  id: 'rate' | 'volume' | 'pitch'
  label: string
  value: number
  unit: string
  min: number
  max: number
  onChange: (value: number) => void
}

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value}`
}

export default function ProsodySlider({ id, label, value, unit, min, max, onChange }: Props) {
  const inputId = `prosody-${id}`

  return (
    <div className="prosody__row">
      <label className="prosody__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="prosody__range"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output className="readout" htmlFor={inputId}>
        {signed(value)}
        <em>{unit}</em>
      </output>
    </div>
  )
}