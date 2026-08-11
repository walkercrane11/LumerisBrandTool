import type { ReactElement } from 'react'
import type { VectorModule } from './types'

// Deterministic integer hash → [0,1). Not cryptographic, just needs to be a
// pure function of its inputs so the same seed always reproduces the same
// placement (SPEC.md §5, Phase 3 "done when": same seed → identical
// placement across reloads).
function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b)
  h ^= Math.imul(b ^ h, 0xc2b2ae35)
  h ^= Math.imul(c ^ h, 0x27d4eb2f)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

// SPEC.md §4.4 lists Dot's params as cells across, radius, jitter, color,
// opacity, blend mode — a uniform full-bleed grid. reference/dot-vector.png
// shows something different: dots confined to an irregular region of the
// canvas, not spanning the whole thing. Walker's direction (asked directly
// rather than guessed, per the established process): make coverage a real
// param, and let the region be positionable. `coverage`/`spread`/`originX`/
// `originY` are the result — coverage falls off linearly from `coverage` at
// (originX, originY) to 0 at `spread` cells away, and each cell's inclusion
// is a seeded coin-flip against that probability. `jitter` (position jitter
// within a cell) was dropped after review — not wanted.
export const dotVector: VectorModule = {
  id: 'dot',
  label: 'Dot',
  uniformSchema: [
    // SPEC.md §3.3 — spacing is cells-across-canvas-width, not pixels.
    { key: 'cellsAcross', label: 'Cells across', type: 'float', unit: 'cellsAcross', min: 4, max: 60, step: 1, default: 20 },
    { key: 'radius', label: 'Radius', type: 'float', min: 0.05, max: 0.5, step: 0.01, default: 0.3 },
    { key: 'coverage', label: 'Coverage', type: 'float', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'spread', label: 'Spread', type: 'float', min: 0.05, max: 1.5, step: 0.01, default: 0.35 },
    { key: 'originX', label: 'Position X', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'originY', label: 'Position Y', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.5 },
    // Brand palette still TBD (SPEC.md §9) — placeholder swatch, not final.
    { key: 'color', label: 'Color', type: 'color', default: '#F4E409' },
    { key: 'opacity', label: 'Opacity', type: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'blendMode', label: 'Blend mode', type: 'enum', options: ['normal', 'multiply', 'screen', 'overlay'], default: 'normal' },
  ],
  render: ({ size, seed, values }) => {
    const cellsAcross = Number(values.cellsAcross)
    const cellSize = size.width / cellsAcross
    const cols = Math.ceil(size.width / cellSize)
    const rows = Math.ceil(size.height / cellSize)
    const radius = Number(values.radius) * cellSize
    const coverage = Number(values.coverage)
    const spreadCells = Math.max(Number(values.spread), 0.001) * cellsAcross
    const originX = Number(values.originX) * size.width
    const originY = Number(values.originY) * size.height
    const color = String(values.color)
    const opacity = Number(values.opacity)
    const blendMode = String(values.blendMode)

    const circles: ReactElement[] = []
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cx = (gx + 0.5) * cellSize
        const cy = (gy + 0.5) * cellSize
        const dxCells = (cx - originX) / cellSize
        const dyCells = (cy - originY) / cellSize
        const dist = Math.sqrt(dxCells * dxCells + dyCells * dyCells)
        const probability = coverage * Math.max(0, 1 - dist / spreadCells)
        if (probability <= 0) continue
        if (hash01(seed, gx, gy) >= probability) continue

        circles.push(<circle key={`${gx}-${gy}`} cx={cx} cy={cy} r={radius} fill={color} />)
      }
    }

    return (
      <g opacity={opacity} style={{ mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'] }}>
        {circles}
      </g>
    )
  },
}
