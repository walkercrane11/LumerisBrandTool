import type { ChangeEvent } from 'react'
import type { UniformDef, UniformValue } from './shaders'
import { BRAND_PALETTE } from './colors'

interface ParamControlsProps {
  schema: UniformDef[]
  values: Record<string, UniformValue>
  onChange: (key: string, value: UniformValue) => void
}

// SPEC.md §4.1 — "adding a seventh shader should require no UI code." Also
// used for vector modules (vectors/types.ts), which follow the identical
// uniformSchema-driven contract — one control renderer for both, not two.
export function ParamControls({ schema, values, onChange }: ParamControlsProps) {
  if (schema.length === 0) return null

  const visibleSchema = schema.filter(
    (def) => !def.visibleWhen || values[def.visibleWhen.key] === def.visibleWhen.equals,
  )
  if (visibleSchema.length === 0) return null

  return (
    <div className="param-controls">
      {visibleSchema.map((def) => (
        <label key={def.key} className="param-control">
          {def.label}
          <UniformControl def={def} value={values[def.key]} onChange={onChange} />
        </label>
      ))}
    </div>
  )
}

function UniformControl({
  def,
  value,
  onChange,
}: {
  def: UniformDef
  value: UniformValue
  onChange: (key: string, value: UniformValue) => void
}) {
  switch (def.type) {
    case 'float':
    case 'int': {
      const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const raw = Number(e.target.value)
        onChange(def.key, def.type === 'int' ? Math.round(raw) : raw)
      }
      return (
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step ?? (def.type === 'int' ? 1 : 0.01)}
          value={Number(value)}
          onChange={handleChange}
        />
      )
    }
    case 'bool':
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(def.key, e.target.checked)}
        />
      )
    case 'enum':
      return (
        <select value={String(value)} onChange={(e) => onChange(def.key, e.target.value)}>
          {(def.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case 'color':
      // SPEC.md §4.1 — locked brand palette, not an arbitrary color input.
      // Was a native <input type="color"> placeholder until the palette
      // landed (SPEC.md §9); now the real swatch-picker the spec calls for.
      return (
        <div className="swatch-picker" role="radiogroup">
          {BRAND_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={String(value).toLowerCase() === hex.toLowerCase()}
              aria-label={hex}
              className="swatch"
              data-selected={String(value).toLowerCase() === hex.toLowerCase()}
              style={{ background: hex }}
              onClick={() => onChange(def.key, hex)}
            />
          ))}
        </div>
      )
  }
}
