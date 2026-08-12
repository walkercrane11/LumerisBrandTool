import type { UniformDef, UniformValue } from './shaders'
import { BRAND_PALETTE } from './colors'
import { EditableSlider } from './EditableSlider'

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
    case 'int':
      return (
        <EditableSlider
          value={Number(value)}
          min={def.min ?? 0}
          max={def.max ?? 1}
          step={def.step ?? (def.type === 'int' ? 1 : 0.01)}
          integer={def.type === 'int'}
          onChange={(next) => onChange(def.key, next)}
        />
      )
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
    case 'color': {
      // SPEC.md §4.1 — locked brand palette, not an arbitrary color input.
      // Was a native <input type="color"> placeholder until the palette
      // landed (SPEC.md §9); now the real swatch-picker the spec calls for.
      // extraSwatches (e.g. Riso's traditional CMY) render after the brand
      // set, with a small visual break so the two groups read as distinct.
      const swatches = [...BRAND_PALETTE, ...(def.extraSwatches ?? [])]
      return (
        <div className="swatch-picker" role="radiogroup">
          {swatches.map((hex, i) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={String(value).toLowerCase() === hex.toLowerCase()}
              aria-label={hex}
              className="swatch"
              data-selected={String(value).toLowerCase() === hex.toLowerCase()}
              data-group-start={i === BRAND_PALETTE.length ? 'true' : undefined}
              style={{ background: hex }}
              onClick={() => onChange(def.key, hex)}
            />
          ))}
        </div>
      )
    }
  }
}
