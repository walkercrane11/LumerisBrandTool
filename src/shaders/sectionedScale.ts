import type { UniformDef } from './types'

// Shared by Halftone/ASCII/Pixelated/Dither (QA pass: "a toggle that
// slices the canvas into sections and uses different scales of the effect
// for each section" — confirmed with Walker as a fixed 2x2 grid, one
// scale slider per quadrant). Always operates on each shader's existing
// `cellsAcross` param; min/max/step/default mirror that param's own
// range, so the four section sliders behave the same way the single one
// already does. Pair with SECTIONED_SCALE_GLSL_UNIFORMS/_EXPR below and
// gl/renderer.ts's shared `sectionedScale()` GLSL function.
export function sectionedScaleUniforms(range: {
  min: number
  max: number
  step: number
  default: number
}): UniformDef[] {
  const quadrant = (suffix: string, label: string): UniformDef => ({
    key: `cellsAcross${suffix}`,
    label,
    type: 'float',
    unit: 'cellsAcross',
    min: range.min,
    max: range.max,
    step: range.step,
    default: range.default,
    visibleWhen: { key: 'sectioned', equals: true },
  })
  return [
    { key: 'sectioned', label: 'Sectioned scale', type: 'bool', default: false },
    quadrant('TL', 'Scale (top-left)'),
    quadrant('TR', 'Scale (top-right)'),
    quadrant('BL', 'Scale (bottom-left)'),
    quadrant('BR', 'Scale (bottom-right)'),
  ]
}

export const SECTIONED_SCALE_GLSL_UNIFORMS = `
uniform bool uSectioned;
uniform float uCellsAcrossTL;
uniform float uCellsAcrossTR;
uniform float uCellsAcrossBL;
uniform float uCellsAcrossBR;
`

export const SECTIONED_SCALE_EXPR =
  'sectionedScale(vUv, uSectioned, uCellsAcross, uCellsAcrossTL, uCellsAcrossTR, uCellsAcrossBL, uCellsAcrossBR)'
