// Rasterizes the Pattern fill band assets (src/shaders/patterns/*.svg) into
// a single-row atlas texture via Canvas 2D — same "build the atlas once at
// shader-compile time, no image asset pipeline needed" strategy as
// glyphAtlas.ts, adapted for SVG shapes instead of text glyphs.
//
// Imported with Vite's `?raw` suffix (see patternFill.ts) so each SVG's
// markup is a plain string already in the bundle — parsed and rasterized
// synchronously here via DOMParser + Canvas 2D fillRect/arc. That matters
// because AtlasDef's `createSource(): TexImageSource` contract (types.ts)
// is synchronous; loading these as `<img>` elements instead would mean an
// async decode() with no synchronous fallback, which the current render
// core has no path for.
//
// Deliberately minimal: only <rect> and <circle> child elements are
// supported — the only two shapes the current 5 pattern assets use.
// Unlike glyphAtlas's white-glyph-on-transparent convention (alpha read as
// coverage, tinted by the shader), these tiles are opaque and carry their
// own baked-in brand-palette colors — Walker's assets are rendered exactly
// as designed, not remapped through a per-band color picker — so this
// rasterizes full RGBA color, not a coverage mask.
interface ParsedShape {
  fill: string
  bounds:
    | { type: 'rect'; x: number; y: number; width: number; height: number }
    | { type: 'circle'; cx: number; cy: number; r: number }
}

interface ParsedSvg {
  width: number
  height: number
  shapes: ParsedShape[]
}

function parseSvg(svgText: string): ParsedSvg {
  const root = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement
  const [, , width, height] = (root.getAttribute('viewBox') ?? '0 0 16 16').split(' ').map(Number)

  const shapes: ParsedShape[] = Array.from(root.children).map((el) => {
    const fill = el.getAttribute('fill') ?? '#000000'
    if (el.tagName === 'rect') {
      return {
        fill,
        bounds: {
          type: 'rect',
          x: Number(el.getAttribute('x') ?? 0),
          y: Number(el.getAttribute('y') ?? 0),
          width: Number(el.getAttribute('width')),
          height: Number(el.getAttribute('height')),
        },
      }
    }
    if (el.tagName === 'circle') {
      return {
        fill,
        bounds: {
          type: 'circle',
          cx: Number(el.getAttribute('cx')),
          cy: Number(el.getAttribute('cy')),
          r: Number(el.getAttribute('r')),
        },
      }
    }
    throw new Error(
      `patternAtlas: unsupported SVG element <${el.tagName}> — only <rect> and <circle> are supported`,
    )
  })

  return { width, height, shapes }
}

export function createPatternAtlasSource(svgTexts: string[], cellSize = 128): () => TexImageSource {
  return () => {
    const parsed = svgTexts.map(parseSvg)
    const canvas = document.createElement('canvas')
    canvas.width = cellSize * parsed.length
    canvas.height = cellSize

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable for pattern atlas generation')

    parsed.forEach((svg, i) => {
      ctx.save()
      ctx.translate(i * cellSize, 0)
      ctx.scale(cellSize / svg.width, cellSize / svg.height)
      for (const shape of svg.shapes) {
        ctx.fillStyle = shape.fill
        if (shape.bounds.type === 'rect') {
          const { x, y, width, height } = shape.bounds
          ctx.fillRect(x, y, width, height)
        } else {
          const { cx, cy, r } = shape.bounds
          ctx.beginPath()
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    })

    return canvas
  }
}
