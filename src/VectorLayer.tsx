import type { RefObject } from 'react'
import type { Size } from './fit'
import type { VectorModule, UniformValue } from './vectors'

interface VectorLayerProps {
  svgRef: RefObject<SVGSVGElement | null>
  vector: VectorModule
  values: Record<string, UniformValue>
  size: Size
  seed: number
}

// SPEC.md §2.3 — the vector layer is real SVG in the DOM, not drawn into
// the canvas during preview; the same node is serialized and rasterized
// into the export composite (§6.1), so this is the only place vector
// shapes ever get generated. Renders nothing (and svgRef.current becomes
// null) when the 'none' vector module is selected — useCanvasRenderer's
// export path uses that null to skip compositing entirely.
export function VectorLayer({ svgRef, vector, values, size, seed }: VectorLayerProps) {
  if (vector.id === 'none') return null

  return (
    <svg ref={svgRef} viewBox={`0 0 ${size.width} ${size.height}`} width={size.width} height={size.height}>
      {vector.render({ size, seed, values })}
    </svg>
  )
}
