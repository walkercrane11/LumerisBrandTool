// SPEC.md §4.1 — shader module contract. Each shader is a data module, not
// a special case; the UI is generated entirely from uniformSchema.

export interface UniformDef {
  key: string
  label: string
  type: 'float' | 'int' | 'color' | 'bool' | 'enum'
  unit?: 'cellsAcross' | 'degrees' | 'normalized'
  min?: number
  max?: number
  step?: number
  options?: string[] // required when type is 'enum'
  default: number | string | boolean
}

export type UniformValue = number | string | boolean

// Fleshed out when the cell-based shaders (ASCII, Pattern fill) arrive in
// Phase 2 — not used by any Phase 1 shader.
export type AtlasDef = unknown

export interface ShaderModule {
  id: string
  label: string
  passes: 1 | 2 | 3 // Riso needs >1 — multi-pass wiring isn't built yet
  fragSource: string | string[] // one per pass
  uniformSchema: UniformDef[] // drives UI generation
  atlas?: AtlasDef
}

export function defaultUniformValues(module: ShaderModule): Record<string, UniformValue> {
  return Object.fromEntries(module.uniformSchema.map((def) => [def.key, def.default]))
}
