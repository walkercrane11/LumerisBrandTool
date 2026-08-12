import type { UniformDef } from './types'

// Shared by Halftone/ASCII/Pixelated/Dither (QA pass: "a toggle that
// slices the canvas into sections and uses different scales of the effect
// for each section"). Originally a fixed 2x2 grid with one slider per
// quadrant; revised per Walker's follow-up QA to a user-controlled rows x
// columns grid, with only two value sliders (low/high) — every section's
// value is interpolated between them based on its position, per a
// direction the user picks (left-right / top-bottom / radial). Always
// operates on each shader's existing `cellsAcross` param; low/high min/
// max/step mirror that param's own range. Pair with
// SECTIONED_SCALE_GLSL_UNIFORMS/_EXPR below and gl/renderer.ts's shared
// `sectionedScale()` GLSL function.
export function sectionedScaleUniforms(range: {
  min: number
  max: number
  step: number
  default: number
}): UniformDef[] {
  const visibleWhen = { key: 'sectioned', equals: true }
  return [
    { key: 'sectioned', label: 'Sectioned scale', type: 'bool', default: false },
    { key: 'sectionRows', label: 'Rows', type: 'int', min: 1, max: 10, step: 1, default: 2, visibleWhen },
    { key: 'sectionCols', label: 'Columns', type: 'int', min: 1, max: 10, step: 1, default: 2, visibleWhen },
    {
      key: 'sectionDirection',
      label: 'Direction',
      type: 'enum',
      options: ['left-right', 'top-bottom', 'radial'],
      default: 'left-right',
      visibleWhen,
    },
    {
      key: 'sectionLow',
      label: 'Scale (low)',
      type: 'float',
      unit: 'cellsAcross',
      min: range.min,
      max: range.max,
      step: range.step,
      default: range.default,
      visibleWhen,
    },
    {
      key: 'sectionHigh',
      label: 'Scale (high)',
      type: 'float',
      unit: 'cellsAcross',
      min: range.min,
      max: range.max,
      step: range.step,
      default: range.default,
      visibleWhen,
    },
  ]
}

export const SECTIONED_SCALE_GLSL_UNIFORMS = `
uniform bool uSectioned;
uniform int uSectionRows;
uniform int uSectionCols;
uniform int uSectionDirection;
uniform float uSectionLow;
uniform float uSectionHigh;
`

export const SECTIONED_SCALE_EXPR =
  'sectionedScale(vUv, uSectioned, uCellsAcross, uSectionRows, uSectionCols, uSectionDirection, uSectionLow, uSectionHigh)'
