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
import { SHADER_MODULES, defaultUniformValues, type ShaderModule, type UniformValue } from './shaders'
import {
  VECTOR_MODULES,
  defaultUniformValues as defaultVectorValues,
  allowedVectorIds,
  type VectorModule,
} from './vectors'
import { ParamControls } from './ParamControls'
import { VectorLayer } from './VectorLayer'
import { exportFilename } from './exportFilename'

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

  const [shader, setShader] = useState<ShaderModule>(SHADER_MODULES[0])
  const [shaderValues, setShaderValues] = useState<Record<string, UniformValue>>(() =>
    defaultUniformValues(SHADER_MODULES[0]),
  )

  const svgRef = useRef<SVGSVGElement>(null)
  const [vector, setVector] = useState<VectorModule>(VECTOR_MODULES[0])
  const [vectorValues, setVectorValues] = useState<Record<string, UniformValue>>(() =>
    defaultVectorValues(VECTOR_MODULES[0]),
  )
  // SPEC.md §5 — seed drives stochastic placement so a preset reproduces
  // exactly. Persisting it across reloads is Phase 4 (state serialization);
  // for now it just needs to be stable within a session and regenerable.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000_000))

  // SPEC.md §3.2 — fit survives a canvas-size change by re-clamping, not
  // resetting. Clamping is a pure function of (fit, imageSize, size), so it's
  // derived on every render rather than synced back into state via an effect.
  const clampedFit = imageSize ? clampFit(fit, imageSize, size) : fit

  const [isEncodingAvif, setIsEncodingAvif] = useState(false)

  const { setImage, exportPng, exportAvif } = useCanvasRenderer(
    canvasRef,
    size,
    imageSize,
    clampedFit,
    shader,
    shaderValues,
    svgRef,
  )

  // SPEC.md §4.5 — vector picker only offers styles valid for the current
  // shader; 'none' is always included.
  const allowedVectors = VECTOR_MODULES.filter((v) => allowedVectorIds(shader.id).includes(v.id))

  const loadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    try {
      // 'flipY' — NOT a workaround for EXIF (browsers apply EXIF
      // orientation automatically regardless of this option; that's
      // orthogonal). This is the fix for a real vertical-flip bug: WebGL's
      // UNPACK_FLIP_Y_WEBGL pixelStorei flag is a no-op when the
      // texImage2D source is an ImageBitmap decoded from a file (confirmed
      // empirically — toggling it produced byte-identical renders). The
      // flip has to happen here, at bitmap creation, instead.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'flipY' })
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

  const handleShaderChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextShader = SHADER_MODULES.find((s) => s.id === e.target.value) ?? SHADER_MODULES[0]
    setShader(nextShader)
    setShaderValues(defaultUniformValues(nextShader))

    // SPEC.md §4.5 — an active vector overlay that isn't sanctioned for the
    // new shader gets reset to 'none' rather than left in an invalid state.
    if (!allowedVectorIds(nextShader.id).includes(vector.id)) {
      const noneV = VECTOR_MODULES.find((v) => v.id === 'none') ?? VECTOR_MODULES[0]
      setVector(noneV)
      setVectorValues(defaultVectorValues(noneV))
    }
  }

  const handleParamChange = (key: string, value: UniformValue) => {
    setShaderValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleVectorChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextVector = VECTOR_MODULES.find((v) => v.id === e.target.value) ?? VECTOR_MODULES[0]
    setVector(nextVector)
    setVectorValues(defaultVectorValues(nextVector))
  }

  const handleVectorParamChange = (key: string, value: UniformValue) => {
    setVectorValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleShuffleSeed = () => setSeed(Math.floor(Math.random() * 1_000_000_000))

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPng = async () => {
    try {
      const blob = await exportPng()
      downloadBlob(blob, exportFilename(size, shader, shaderValues, clampedFit, 'png'))
    } catch (err) {
      console.error('PNG export failed', err)
    }
  }

  const handleExportAvif = async () => {
    setIsEncodingAvif(true)
    try {
      const blob = await exportAvif()
      downloadBlob(blob, exportFilename(size, shader, shaderValues, clampedFit, 'avif'))
    } catch (err) {
      console.error('AVIF export failed', err)
    } finally {
      setIsEncodingAvif(false)
    }
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
        <label className="shader-select">
          Shader
          <select value={shader.id} onChange={handleShaderChange}>
            {SHADER_MODULES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="vector-select">
          Vector
          <select value={vector.id} onChange={handleVectorChange}>
            {allowedVectors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {vector.id !== 'none' && vector.id !== 'scribbles' && (
          <button type="button" onClick={handleShuffleSeed}>
            Shuffle
          </button>
        )}
        <button type="button" disabled={!imageSize} onClick={() => void handleExportPng()}>
          Export PNG
        </button>
        <button
          type="button"
          disabled={!imageSize || isEncodingAvif}
          onClick={() => void handleExportAvif()}
        >
          {isEncodingAvif ? 'Encoding AVIF…' : 'Export AVIF'}
        </button>
      </header>
      <ParamControls schema={shader.uniformSchema} values={shaderValues} onChange={handleParamChange} />
      <ParamControls schema={vector.uniformSchema} values={vectorValues} onChange={handleVectorParamChange} />
      <main className="canvas-stage" onDrop={handleDrop} onDragOver={handleDragOver}>
        <div className="canvas-frame" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
          <canvas
            ref={canvasRef}
            className={imageSize ? 'draggable' : undefined}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <VectorLayer svgRef={svgRef} vector={vector} values={vectorValues} size={size} seed={seed} />
        </div>
      </main>
    </div>
  )
}

export default App
