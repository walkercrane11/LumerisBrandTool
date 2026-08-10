import { useEffect, useRef, type RefObject } from 'react'
import { createRenderer, type Renderer } from './gl/renderer'
import type { CanvasSize } from './canvasSizes'
import { computeTransform, type FitState, type Size } from './fit'
import { SHADER_MODULES, type ShaderModule, type UniformValue } from './shaders'

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  size: CanvasSize,
  imageSize: Size | null,
  fit: FitState,
  shader: ShaderModule,
  shaderValues: Record<string, UniformValue>,
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

  const exportPng = (): Promise<Blob> => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return Promise.reject(new Error('Canvas not ready'))

    // WebGL's drawing buffer isn't guaranteed to still hold the last
    // rendered frame by the time toBlob is called — force a fresh render
    // synchronously, right before capture, rather than trusting whatever's
    // already in the buffer. SPEC.md §7: "prove export... it is the
    // assumption most likely to bite."
    const transform = imageSize ? computeTransform(imageSize, size, fit) : undefined
    renderer.render(imageSize ? { shader, values: shaderValues, transform } : undefined)

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob returned null'))
      }, 'image/png')
    })
  }

  return { setImage, exportPng }
}
