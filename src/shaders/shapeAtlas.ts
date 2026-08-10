// Same role as glyphAtlas.ts's createGlyphAtlasSource, for Pattern fill:
// a ramp of increasing-coverage shapes, sparsest to densest. Rectangles
// instead of text — no font-metric guesswork, exact pixel control, so
// there's no equivalent of the glyph-atlas gap issue here by construction.
export function createSquareAtlasSource(cellSize = 64, levels = 8): () => TexImageSource {
  return () => {
    const canvas = document.createElement('canvas')
    canvas.width = cellSize * levels
    canvas.height = cellSize

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for shape atlas generation')

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'

    for (let i = 0; i < levels; i++) {
      const t = i / (levels - 1)
      // Max 92% of cell — same margin-from-edge reasoning as the glyph
      // atlas, so a square never touches (and can't bleed into) the next
      // cell over.
      const size = t * cellSize * 0.92
      const cx = i * cellSize + cellSize / 2
      const cy = cellSize / 2
      ctx.fillRect(cx - size / 2, cy - size / 2, size, size)
    }

    return canvas
  }
}
