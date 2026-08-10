// Generates a glyph atlas at runtime via Canvas 2D rather than shipping an
// image asset — no font/build tooling needed, and it's cheap (runs once at
// shader-compile time, not per frame). One row, one glyph per column.
export function createGlyphAtlasSource(glyphs: string, cellSize = 64): () => TexImageSource {
  return () => {
    const canvas = document.createElement('canvas')
    canvas.width = cellSize * glyphs.length
    canvas.height = cellSize

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for glyph atlas generation')

    // Transparent background, white glyphs — the shader reads alpha as
    // glyph coverage and mixes in the user's fg/bg colors itself.
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.font = `${Math.round(cellSize * 0.75)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < glyphs.length; i++) {
      ctx.fillText(glyphs[i], i * cellSize + cellSize / 2, cellSize / 2 + 1)
    }

    return canvas
  }
}
