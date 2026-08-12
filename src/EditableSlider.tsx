import { useRef, useState, type KeyboardEvent } from 'react'

interface EditableSliderProps {
  value: number
  min: number
  max: number
  step: number
  integer?: boolean
  disabled?: boolean
  onChange: (value: number) => void
}

// QA pass, referencing reference/slider-reference.png — Walker wants a
// numerical value visible (and editable) for every slider in the app.
// Confirmed direction: keep the native <input type="range"> rather than
// building a fully custom fill-bar control matching the reference's exact
// look, but make the value itself click-to-edit the way that reference's
// sliders behave. Used both by ParamControls (every shader/vector float/
// int param) and directly by App.tsx's standalone Zoom slider.
export function EditableSlider({ value, min, max, step, integer, disabled, onChange }: EditableSliderProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const decimals = !integer && step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0
  const formatted = value.toFixed(decimals)

  const commit = () => {
    setEditing(false)
    const raw = inputRef.current?.value
    const parsed = raw === undefined ? NaN : Number(raw)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(max, Math.max(min, parsed))
    onChange(integer ? Math.round(clamped) : clamped)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter commits directly rather than calling .blur() and relying on
    // onBlur to do it — blur() only dispatches a real blur event when the
    // document actually has focus, which isn't guaranteed (e.g. a
    // backgrounded/automated tab), so routing Enter through it was a
    // silent no-op in exactly that case. Direct commit has no such
    // dependency; still blur() afterward so the input visibly defocuses.
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      inputRef.current?.blur()
    }
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <div className="slider-row">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(integer ? Math.round(Number(e.target.value)) : Number(e.target.value))}
      />
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          className="slider-value-input"
          min={min}
          max={max}
          step={step}
          defaultValue={value}
          autoFocus
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <button
          type="button"
          className="slider-value"
          disabled={disabled}
          onClick={() => setEditing(true)}
        >
          {formatted}
        </button>
      )}
    </div>
  )
}
