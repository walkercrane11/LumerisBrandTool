import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from 'react'
import { CANVAS_SIZES } from './canvasSizes'
import { useCanvasRenderer } from './useCanvasRenderer'
import { DEFAULT_FIT, clampFit, coverRatios, type FitState, type Size } from './fit'

interface DragOrigin {
  startX: number
  startY: number
  startFit: FitState
}

function App() {
  const [sizeId, setSizeId] = useState(CANVAS_SIZES[0].id)
  const size = CANVAS_SIZES.find((s) => s.id === sizeId) ?? CANVAS_SIZES[0]
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [imageSize, setImageSize] = useState<Size | null>(null)
  const [fit, setFit] = useState<FitState>(DEFAULT_FIT)

  // SPEC.md §3.2 — fit survives a canvas-size change by re-clamping, not
  // resetting. Clamping is a pure function of (fit, imageSize, size), so it's
  // derived on every render rather than synced back into state via an effect.
  const clampedFit = imageSize ? clampFit(fit, imageSize, size) : fit

  const { setImage } = useCanvasRenderer(canvasRef, size, imageSize, clampedFit)

  const loadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    try {
      const bitmap = await createImageBitmap(file)
      setImage(bitmap)
      setImageSize({ width: bitmap.width, height: bitmap.height })
      setFit(DEFAULT_FIT)
    } catch (err) {
      console.error('Failed to decode image', err)
    }
  }

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void loadFile(file)
  }

  const handleDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) void loadFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
  }

  const dragRef = useRef<DragOrigin | null>(null)

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!imageSize) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startFit: clampedFit }
    // Can throw NotFoundError if the browser has already dropped this
    // pointer (e.g. rapid re-clicks); the drag still works without capture,
    // it just won't track the pointer past the canvas bounds.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !imageSize) return
    const origin = dragRef.current
    const rect = e.currentTarget.getBoundingClientRect()
    const { ratioX, ratioY } = coverRatios(imageSize, size, origin.startFit.zoom)
    const dxNorm = (e.clientX - origin.startX) / rect.width
    const dyNorm = (e.clientY - origin.startY) / rect.height
    setFit({
      zoom: origin.startFit.zoom,
      x: origin.startFit.x + dxNorm * ratioX,
      // Canvas UV is Y-up (see gl/renderer.ts vertex shader) but screen Y
      // is Y-down, so a downward drag must subtract, not add, to make the
      // image follow the cursor (confirmed empirically — see PR #10).
      y: origin.startFit.y - dyNorm * ratioY,
    })
  }

  const handlePointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore — capture may already be gone
    }
  }

  const handleZoomChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFit({ ...clampedFit, zoom: Number(e.target.value) })
  }

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Lumeris Brand Tool</h1>
        <label className="size-select">
          Canvas size
          <select value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
            {CANVAS_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.width}×{s.height})
              </option>
            ))}
          </select>
        </label>
        <label className="upload">
          Upload image
          <input type="file" accept="image/*" onChange={handleFileInput} />
        </label>
        <label className="zoom-control">
          Zoom
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={clampedFit.zoom}
            disabled={!imageSize}
            onChange={handleZoomChange}
          />
        </label>
      </header>
      <main className="canvas-stage" onDrop={handleDrop} onDragOver={handleDragOver}>
        <canvas
          ref={canvasRef}
          className={imageSize ? 'draggable' : undefined}
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </main>
    </div>
  )
}

export default App
