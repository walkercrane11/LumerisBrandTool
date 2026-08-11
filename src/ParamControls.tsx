import type { ChangeEvent } from 'react'
import type { UniformDef, UniformValue } from './shaders'

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

  return (
    <div className="param-controls">
      {schema.map((def) => (
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
      // Brand palette is still TBD (SPEC.md §9) — a native picker is a
      // placeholder, not the swatch-locked control §4.1 calls for.
      return (
        <input
          type="color"
          value={String(value)}
          onChange={(e) => onChange(def.key, e.target.value)}
        />
      )
  }
}
