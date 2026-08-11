import { useEffect, useRef, type RefObject } from 'react'
import { createRenderer, type Renderer } from './gl/renderer'
import type { CanvasSize } from './canvasSizes'
import { computeTransform, type FitState, type Size } from './fit'
import { SHADER_MODULES, type ShaderModule, type UniformValue } from './shaders'
import { compositeVectorOnto } from './exportComposite'

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  size: CanvasSize,
  imageSize: Size | null,
  fit: FitState,
  shader: ShaderModule,
  shaderValues: Record<string, UniformValue>,
  svgRef: RefObject<SVGSVGElement | null>,
) {
  const rendererRef = useRef<Renderer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!rendererRef.current) {
      rendererRef.current = createRenderer(canvas, SHADER_MODULES)
    }

    // SPEC.md §2.2 — canvas element dimensions ARE the export dimensions.
    // Display scaling happens purely in CSS (see App.tsx); this never changes
    // for display reasons, only when the selected canvas size changes.
    canvas.width = size.width
    canvas.height = size.height

    const transform = imageSize ? computeTransform(imageSize, size, fit) : undefined
    rendererRef.current.render(
      imageSize ? { shader, values: shaderValues, transform } : undefined,
    )
  }, [canvasRef, size, imageSize, fit, shader, shaderValues])

  const setImage = (source: TexImageSource) => {
    // Uploads to the GPU only. The caller updates imageSize/fit state right
    // after, which re-triggers the effect above with the correct transform —
    // rendering here too would draw one frame with a stale/identity one.
    rendererRef.current?.setImage(source)
  }

  const exportPng = async (): Promise<Blob> => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) throw new Error('Canvas not ready')

    // WebGL's drawing buffer isn't guaranteed to still hold the last
    // rendered frame by the time toBlob is called — force a fresh render
    // synchronously, right before capture, rather than trusting whatever's
    // already in the buffer. SPEC.md §7: "prove export... it is the
    // assumption most likely to bite."
    const transform = imageSize ? computeTransform(imageSize, size, fit) : undefined
    renderer.render(imageSize ? { shader, values: shaderValues, transform } : undefined)

    // Only the vector-present path is new here — no vector layer takes the
    // exact toBlob call that was already verified cross-browser in Phase 1.
    const svg = svgRef.current
    const target = svg ? await compositeVectorOnto(canvas, svg, size.width, size.height) : canvas

    return new Promise((resolve, reject) => {
      target.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob returned null'))
      }, 'image/png')
    })
  }

  const exportAvif = async (): Promise<Blob> => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) throw new Error('Canvas not ready')

    // SPEC.md §6.2 — do not use canvas.toBlob('image/avif'); only Chrome
    // 124+ supports it, Firefox/Safari silently fall back to PNG while
    // still handing back a file. @jsquash/avif (WASM) is identical on
    // every browser. Dynamic import so the WASM chunk loads on first
    // export, not at page load.
    const { encode } = await import('@jsquash/avif')

    // Same freshness requirement as exportPng, but readPixels() reads the
    // framebuffer directly rather than going through toBlob — see
    // gl/renderer.ts's readPixels for why that's actually the stronger
    // guarantee of the two. Only used when there's no vector layer to
    // composite; the already-verified no-vector path is unchanged.
    const transform = imageSize ? computeTransform(imageSize, size, fit) : undefined
    renderer.render(imageSize ? { shader, values: shaderValues, transform } : undefined)

    const svg = svgRef.current
    let imageData: ImageData
    if (svg) {
      const composited = await compositeVectorOnto(canvas, svg, size.width, size.height)
      const ctx = composited.getContext('2d')
      if (!ctx) throw new Error('2D context unavailable for export compositing')
      imageData = ctx.getImageData(0, 0, size.width, size.height)
    } else {
      imageData = renderer.readPixels()
    }

    const arrayBuffer = await encode(imageData)
    return new Blob([arrayBuffer], { type: 'image/avif' })
  }

  return { setImage, exportPng, exportAvif }
}
