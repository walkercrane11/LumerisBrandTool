import type { PresetLook } from './state'

// SPEC.md §5.2 — named presets are "art-directed by Holden Ellis," the
// brand-governance layer. Not delivered yet — these five are directional
// placeholders only, composed to exercise the preset mechanism across
// varied sanctioned shader×vector combinations (§4.5); swap freely once
// real presets arrive. Each only overrides the params that matter for its
// look — everything else falls back to that shader/vector's own defaults
// (see resolvePresetLook). Colors here now draw from the real brand
// palette (colors.ts, landed 2026-08-12) rather than invented placeholders.
export const PRESETS: PresetLook[] = [
  {
    id: 'riso-bloom',
    label: 'Riso Bloom',
    shader: {
      id: 'riso',
      params: { cellsAcross: 130, offsetAmount: 0.006, grainAmount: 0.25, layerOpacity: 0.85 },
    },
    vector: {
      id: 'dot',
      params: { cellsAcross: 24, radius: 0.32, coverage: 0.7, spread: 0.4, color: '#081011', blendMode: 'multiply' },
    },
  },
  {
    id: 'halftone-sketch',
    label: 'Halftone Sketch',
    shader: {
      id: 'halftone',
      params: { cellsAcross: 90, contrast: 1.3, fg: '#081011', bg: '#FFFAE9' },
    },
    vector: {
      id: 'scribbles',
      params: {
        asset1: 'scribble-03', x1: 0.25, y1: 0.6, rotation1: 15, scale1: 1.4,
        enableSecond: true, asset2: 'scribble-05', x2: 0.75, y2: 0.3, rotation2: 200, scale2: 1,
        color: '#530E06', opacity: 0.85, blendMode: 'multiply',
      },
    },
  },
  {
    id: 'mono-grid',
    label: 'Mono Grid',
    shader: {
      id: 'pattern-fill',
      params: { cellsAcross: 16, contrast: 1.2 },
    },
    vector: {
      id: 'scribbles',
      params: { asset1: 'scribble-02', x1: 0.5, y1: 0.5, rotation1: 45, scale1: 1.8, color: '#1836F0', opacity: 0.8, blendMode: 'screen' },
    },
  },
  {
    id: 'clean-mosaic',
    label: 'Clean Mosaic',
    shader: { id: 'none', params: {} },
    vector: {
      id: 'square',
      params: { cellsAcross: 14, size: 0.55, rotation: 45, coverage: 0.55, spread: 0.4, originY: 0.4, color: '#FEFB53' },
    },
  },
  {
    id: 'soft-dither',
    label: 'Soft Dither',
    shader: {
      id: 'dither',
      params: { cellsAcross: 100, contrast: 1.1 },
    },
    vector: {
      id: 'scribbles',
      params: { asset1: 'scribble-06', x1: 0.7, y1: 0.7, rotation1: 300, scale1: 1.2, color: '#FF453B', opacity: 0.9, blendMode: 'multiply' },
    },
  },
]
