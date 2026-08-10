import { useRef, useState } from 'react'
import { CANVAS_SIZES } from './canvasSizes'
import { useCanvasRenderer } from './useCanvasRenderer'

function App() {
  const [sizeId, setSizeId] = useState(CANVAS_SIZES[0].id)
  const size = CANVAS_SIZES.find((s) => s.id === sizeId) ?? CANVAS_SIZES[0]
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useCanvasRenderer(canvasRef, size)

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
      </header>
      <main className="canvas-stage">
        <canvas
          ref={canvasRef}
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        />
      </main>
    </div>
  )
}

export default App
