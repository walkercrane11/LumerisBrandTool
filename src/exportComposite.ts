// SPEC.md §6.1 — compositing: canvas already holds the shaded image at true
// export dimensions; serialize the vector <svg> → Blob → Image → drawImage
// onto the canvas at 1:1. No scaling anywhere in this pipeline.
export async function compositeVectorOnto(
  source: HTMLCanvasElement,
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable for export compositing')

  // Must happen before any await — same reasoning as the synchronous
  // render-then-capture pattern in useCanvasRenderer's exportPng/exportAvif:
  // the WebGL canvas's drawing buffer isn't guaranteed to survive a task
  // boundary, so it has to be copied out immediately, in this same tick.
  ctx.drawImage(source, 0, 0)

  const svgString = new XMLSerializer().serializeToString(svg)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to rasterize vector layer for export'))
      img.src = url
    })
    ctx.drawImage(img, 0, 0, width, height)
  } finally {
    URL.revokeObjectURL(url)
  }

  return out
}
