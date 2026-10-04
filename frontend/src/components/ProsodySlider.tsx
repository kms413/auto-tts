interface Props {
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

export default function ProsodySlider({ label, value, unit, min, max, onChange }: Props) {
  const inputId = `prosody-${label}`

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