import type { Size } from '../fit'

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

export interface CoverageGridCell {
  cx: number
  cy: number
  cellSize: number
}

export interface CoverageGridParams {
  size: Size
  seed: number
  cellsAcross: number
  coverage: number
  spread: number // radius of influence, in cells
  originX: number // normalized 0-1
  originY: number // normalized 0-1
  // Bilateral mirror fold (Square, reference/square-vector.png): a cell and
  // its reflection across the origin's row/column make the identical
  // inclusion decision, instead of independent per-cell randomness (Dot).
  // Distance-from-origin is snapped to the nearest cell center in this mode
  // too, so a mirror pair's probabilities are *exactly* equal (not just
  // close) regardless of where originX/Y falls within a cell — otherwise a
  // pair straddling the fold line could land on opposite sides of the
  // pass/fail threshold and break the symmetry.
  mirror?: boolean
}

// Shared by Dot and Square (vectors/dot.tsx, vectors/square.tsx) — same
// per-cell coverage-falloff placement mechanism, added after reviewing
// their reference comps (see dot.tsx's comment for why the plain
// full-bleed-grid params SPEC.md §4.4 originally listed weren't enough).
export function coverageGridCells({
  size,
  seed,
  cellsAcross,
  coverage,
  spread,
  originX,
  originY,
  mirror = false,
}: CoverageGridParams): CoverageGridCell[] {
  const cellSize = size.width / cellsAcross
  const cols = Math.ceil(size.width / cellSize)
  const rows = Math.ceil(size.height / cellSize)
  const spreadCells = Math.max(spread, 0.001) * cellsAcross

  const originPxX = originX * size.width
  const originPxY = originY * size.height
  // Nearest cell column/row to the origin — used as the exact fold axis
  // when mirroring, and (only in that mode) for distance too, so pairs are
  // always exactly symmetric.
  const originCol = Math.round(originPxX / cellSize - 0.5)
  const originRow = Math.round(originPxY / cellSize - 0.5)

  const cells: CoverageGridCell[] = []
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const dxCells = mirror ? gx - originCol : (cellSize * (gx + 0.5) - originPxX) / cellSize
      const dyCells = mirror ? gy - originRow : (cellSize * (gy + 0.5) - originPxY) / cellSize
      const dist = Math.sqrt(dxCells * dxCells + dyCells * dyCells)
      const probability = coverage * Math.max(0, 1 - dist / spreadCells)
      if (probability <= 0) continue

      let hashX = gx
      let hashY = gy
      if (mirror) {
        hashX = Math.min(gx, 2 * originCol - gx)
        hashY = Math.min(gy, 2 * originRow - gy)
      }
      if (hash01(seed, hashX, hashY) >= probability) continue

      cells.push({ cx: (gx + 0.5) * cellSize, cy: (gy + 0.5) * cellSize, cellSize })
    }
  }
  return cells
}
