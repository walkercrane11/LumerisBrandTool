import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { createRenderer, type Renderer } from './gl/renderer'
import type { CanvasSize } from './canvasSizes'

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  size: CanvasSize,
) {
  const rendererRef = useRef<Renderer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!rendererRef.current) {
      rendererRef.current = createRenderer(canvas)
    }

    // SPEC.md §2.2 — canvas element dimensions ARE the export dimensions.
    // Display scaling happens purely in CSS (see App.tsx); this never changes
    // for display reasons, only when the selected canvas size changes.
    canvas.width = size.width
    canvas.height = size.height
    rendererRef.current.render()
  }, [canvasRef, size])

  const setImage = useCallback((source: TexImageSource) => {
    rendererRef.current?.setImage(source)
    rendererRef.current?.render()
  }, [])

  return { setImage }
}
