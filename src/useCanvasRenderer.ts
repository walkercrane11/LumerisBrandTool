import { useEffect, useRef, type RefObject } from 'react'
import { createRenderer, type Renderer } from './gl/renderer'
import type { CanvasSize } from './canvasSizes'
import { computeTransform, type FitState, type Size } from './fit'

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  size: CanvasSize,
  imageSize: Size | null,
  fit: FitState,
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

    const transform = imageSize ? computeTransform(imageSize, size, fit) : undefined
    rendererRef.current.render(transform)
  }, [canvasRef, size, imageSize, fit])

  const setImage = (source: TexImageSource) => {
    // Uploads to the GPU only. The caller updates imageSize/fit state right
    // after, which re-triggers the effect above with the correct transform —
    // rendering here too would draw one frame with a stale/identity one.
    rendererRef.current?.setImage(source)
  }

  return { setImage }
}
