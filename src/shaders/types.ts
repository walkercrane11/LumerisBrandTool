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

// Cell-based shaders (ASCII, Pattern fill — SPEC.md §4.2) sample a grid
// cell's luminance, map it to an index, and stamp the corresponding cell
// out of this grid texture. `createSource` builds the actual pixel data
// once at shader-compile time (see gl/renderer.ts) — kept as a function
// rather than raw data so each module can generate its own atlas (e.g.
// ASCII renders glyphs via Canvas 2D) without the render core needing to
// know how.
export interface AtlasDef {
  cols: number
  rows: number
  cellCount: number
  createSource: () => TexImageSource
}

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
