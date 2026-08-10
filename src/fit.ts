export interface FitState {
  zoom: number
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

// SPEC.md §5.1 — fit state schema: { zoom, x, y }.
export const DEFAULT_FIT: FitState = { zoom: 1, x: 0, y: 0 }

const MIN_ZOOM = 1
// Not in SPEC — an upper bound is needed for a usable slider; 4x is a
// pragmatic default for a non-technical audience, not a spec requirement.
const MAX_ZOOM = 4

// Fraction of the canvas covered by the displayed image on each axis, at the
// given zoom. 1 means that axis exactly fills the canvas (no crop room);
// less than 1 means the image overflows and can be panned on that axis.
export function coverRatios(imageSize: Size, canvasSize: Size, zoom: number) {
  const scaleBase = Math.max(
    canvasSize.width / imageSize.width,
    canvasSize.height / imageSize.height,
  )
  const scale = scaleBase * zoom
  return {
    ratioX: canvasSize.width / (imageSize.width * scale),
    ratioY: canvasSize.height / (imageSize.height * scale),
  }
}

// SPEC.md §3.2 — pan/zoom clamped so the canvas can never show empty area,
// and fit survives a canvas-size change by re-clamping rather than resetting.
export function clampFit(fit: FitState, imageSize: Size, canvasSize: Size): FitState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fit.zoom))
  const { ratioX, ratioY } = coverRatios(imageSize, canvasSize, zoom)
  const maxPanX = Math.max(0, (1 - ratioX) / 2)
  const maxPanY = Math.max(0, (1 - ratioY) / 2)
  return {
    zoom,
    x: Math.min(maxPanX, Math.max(-maxPanX, fit.x)),
    y: Math.min(maxPanY, Math.max(-maxPanY, fit.y)),
  }
}

export interface Transform {
  ratioX: number
  ratioY: number
  panX: number
  panY: number
}

export function computeTransform(imageSize: Size, canvasSize: Size, fit: FitState): Transform {
  const { ratioX, ratioY } = coverRatios(imageSize, canvasSize, fit.zoom)
  return { ratioX, ratioY, panX: fit.x, panY: fit.y }
}
