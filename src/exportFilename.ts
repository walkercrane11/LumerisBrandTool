import type { CanvasSize } from './canvasSizes'
import type { ShaderModule, UniformValue } from './shaders'
import type { FitState } from './fit'

// FNV-1a, 32-bit — not cryptographic, just short and deterministic.
function shortHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// SPEC.md §6.3 — {preset-or-shader}_{canvas-label}_{shortHash}.{ext}.
// There's no preset system yet (that's Phase 4), so this hashes the state
// that actually exists today: shader + its params + fit. Extend the hashed
// object once presets/vector state land rather than treating this as final.
export function exportFilename(
  size: CanvasSize,
  shader: ShaderModule,
  shaderValues: Record<string, UniformValue>,
  fit: FitState,
  ext: string,
): string {
  const state = JSON.stringify({ shader: shader.id, params: shaderValues, fit })
  return `${shader.id}_${size.id}_${shortHash(state)}.${ext}`
}
