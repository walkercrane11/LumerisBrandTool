import type { UniformDef, UniformValue } from './shaders/types'

// Generic per-UniformDef random value generator, shared by the global
// Randomize button (App.tsx) for shader params and for whichever vector
// gets picked when it doesn't implement its own `randomizeValues` (Dot/
// Square — Scribbles does implement one, see vectors/scribbles/index.tsx).
//
// Skips `color`-typed params entirely — brand palette policy (SPEC.md
// §4.1), same reasoning already applied to Scribbles' own randomizeValues:
// colors are a deliberate brand choice, not something a randomize button
// should pick arbitrarily.
export function randomizeSchemaValues(schema: UniformDef[]): Record<string, UniformValue> {
  const values: Record<string, UniformValue> = {}

  for (const def of schema) {
    switch (def.type) {
      case 'float': {
        const min = def.min ?? 0
        const max = def.max ?? 1
        const step = def.step ?? 0.01
        const raw = min + Math.random() * (max - min)
        values[def.key] = Math.round(raw / step) * step
        break
      }
      case 'int': {
        const min = def.min ?? 0
        const max = def.max ?? 1
        values[def.key] = Math.round(min + Math.random() * (max - min))
        break
      }
      case 'bool':
        values[def.key] = Math.random() < 0.5
        break
      case 'enum':
        if (def.options && def.options.length > 0) {
          values[def.key] = def.options[Math.floor(Math.random() * def.options.length)]
        }
        break
      case 'color':
        break
    }
  }

  return values
}
