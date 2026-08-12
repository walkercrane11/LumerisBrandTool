import type { VectorModule } from './types'
import { coverageGridCells } from './coverageGrid'

// SPEC.md §4.4: "Square pattern — same [as Dot], rectangles. Params add
// rotation." reference/square-vector.png shows something Dot's mechanism
// alone doesn't produce, though: true bilateral mirror symmetry (left-right
// and top-bottom independently, not diagonal/4-fold) — isolated squares
// mirrored in all four corners, denser woven checkerboard toward the
// center. Confirmed with Walker before building. coverageGrid.ts's
// `mirror: true` option handles this: a cell and its reflection across the
// origin's row/column share one inclusion decision instead of each being
// an independent coin-flip, so the result is symmetric rather than merely
// having a symmetric density field.
//
// `size` replaces Dot's `radius` (a radius doesn't fit a square) — side
// length as a fraction of the cell.
export const squareVector: VectorModule = {
  id: 'square',
  label: 'Square',
  uniformSchema: [
    { key: 'cellsAcross', label: 'Cells across', type: 'float', unit: 'cellsAcross', min: 4, max: 60, step: 1, default: 20 },
    // max 1 (not 0.95) — at size 1, sideLength equals the cell width, so
    // adjacent squares' edges exactly touch rather than leaving a gap.
    // Walker's QA: the old 0.95 ceiling never quite closed that gap.
    { key: 'size', label: 'Size', type: 'float', min: 0.05, max: 1, step: 0.01, default: 0.6 },
    { key: 'rotation', label: 'Rotation', type: 'float', unit: 'degrees', min: 0, max: 90, step: 1, default: 0 },
    { key: 'coverage', label: 'Coverage', type: 'float', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'spread', label: 'Spread', type: 'float', min: 0.05, max: 1.5, step: 0.01, default: 0.35 },
    { key: 'originX', label: 'Position X', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'originY', label: 'Position Y', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.5 },
    // SPEC.md §9 — brand palette landed (colors.ts). Red, not yellow —
    // distinct from Dot's default so the two read apart at a glance.
    { key: 'color', label: 'Color', type: 'color', default: '#FF453B' },
    { key: 'opacity', label: 'Opacity', type: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'blendMode', label: 'Blend mode', type: 'enum', options: ['normal', 'multiply', 'screen', 'overlay'], default: 'normal' },
  ],
  render: ({ size, seed, values }) => {
    const cellsAcross = Number(values.cellsAcross)
    const sideLength = Number(values.size) * (size.width / cellsAcross)
    const rotation = Number(values.rotation)
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
      mirror: true,
    })

    return (
      <g opacity={opacity} style={{ mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'] }}>
        {cells.map(({ cx, cy }) => (
          <rect
            key={`${cx}-${cy}`}
            x={cx - sideLength / 2}
            y={cy - sideLength / 2}
            width={sideLength}
            height={sideLength}
            fill={color}
            transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
          />
        ))}
      </g>
    )
  },
}
