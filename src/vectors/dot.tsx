import type { VectorModule } from './types'
import { coverageGridCells } from './coverageGrid'

// SPEC.md §4.4 lists Dot's params as cells across, radius, jitter, color,
// opacity, blend mode — a uniform full-bleed grid. reference/dot-vector.png
// shows something different: dots confined to an irregular region of the
// canvas, not spanning the whole thing. Walker's direction (asked directly
// rather than guessed, per the established process): make coverage a real
// param, and let the region be positionable. `coverage`/`spread`/`originX`/
// `originY` are the result — coverage falls off linearly from `coverage` at
// (originX, originY) to 0 at `spread` cells away, and each cell's inclusion
// is a seeded coin-flip against that probability (coverageGrid.ts, shared
// with Square). `jitter` (position jitter within a cell) was dropped after
// review — not wanted.
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
    // SPEC.md §9 — brand palette landed (colors.ts).
    { key: 'color', label: 'Color', type: 'color', default: '#FEFB53' },
    { key: 'opacity', label: 'Opacity', type: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'blendMode', label: 'Blend mode', type: 'enum', options: ['normal', 'multiply', 'screen', 'overlay'], default: 'normal' },
  ],
  render: ({ size, seed, values }) => {
    const cellsAcross = Number(values.cellsAcross)
    const radius = Number(values.radius) * (size.width / cellsAcross)
    const color = String(values.color)
    const opacity = Number(values.opacity)
    const blendMode = String(values.blendMode)

    const cells = coverageGridCells({
      size,
      seed,
      cellsAcross,
      coverage: Number(values.coverage),
      spread: Number(values.spread),
      originX: Number(values.originX),
      originY: Number(values.originY),
    })

    return (
      <g opacity={opacity} style={{ mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'] }}>
        {cells.map(({ cx, cy }) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={radius} fill={color} />
        ))}
      </g>
    )
  },
}
