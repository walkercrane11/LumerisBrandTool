import type { ReactNode } from 'react'
import type { UniformDef, UniformValue } from '../shaders/types'
import type { Size } from '../fit'

export type { UniformDef, UniformValue }

// SPEC.md §2.3 — the vector layer is real SVG in the DOM, not drawn into
// the canvas during preview. `render` returns the SVG child elements for
// the current param values; `seed` drives any stochastic placement (§5),
// kept separate from `values` since it isn't a uniformSchema-driven param.
export interface VectorRenderArgs {
  size: Size
  seed: number
  values: Record<string, UniformValue>
}

// Mirrors ShaderModule (shaders/types.ts §4.1) — same data-module pattern,
// UI generated entirely from uniformSchema, so adding a vector style
// requires no UI code.
export interface VectorModule {
  id: string
  label: string
  uniformSchema: UniformDef[]
  render: (args: VectorRenderArgs) => ReactNode
}

export function defaultUniformValues(module: VectorModule): Record<string, UniformValue> {
  return Object.fromEntries(module.uniformSchema.map((def) => [def.key, def.default]))
}
