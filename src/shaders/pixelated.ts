import type { ShaderModule } from './types'
import { sectionedScaleUniforms, SECTIONED_SCALE_GLSL_UNIFORMS, SECTIONED_SCALE_EXPR } from './sectionedScale'

// SPEC.md §4.2 — "block average or nearest sample." Params: cells across,
// sample mode, optional posterize levels. Sample mode is genuinely binary
// (spec text: "block average OR nearest sample"), so it's a bool rather
// than reaching for the enum type — see SPEC.md §4.1's `options` note.
//
// QA pass — Walker wants color-scheme control, referencing reference/
// pixel.png (a duotone: near-black background, light mint foreground, not
// full-color pixelation). Confirmed with Walker: a simple 2-color duotone,
// same fg/bg pattern Dither/Halftone/ASCII already have. `duotone` is a
// new toggle (default false — existing full-color behavior is unchanged
// when off, no regression for anyone already using this shader).
// `posterizeLevels` does double duty as the duotone tone-step count when
// duotone is on, rather than adding a redundant third param — the existing
// RGB posterize step (when >1) already discretizes the block color before
// duotone recoloring reads its luminance, so the two compose naturally.
//
// QA pass — sectioned-scale toggle (sectionedScale.ts, shared with ASCII/
// Halftone/Dither): canvas splits into a rows x cols grid, each section's
// block size interpolated between a low/high pair instead of one global
// value.
const CELLS_ACROSS_RANGE = { min: 4, max: 300, step: 1, default: 60 }

export const pixelatedShader: ShaderModule = {
  id: 'pixelated',
  label: 'Pixelated',
  passes: 1,
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Block size',
      type: 'float',
      unit: 'cellsAcross',
      ...CELLS_ACROSS_RANGE,
      visibleWhen: { key: 'sectioned', equals: false },
    },
    ...sectionedScaleUniforms(CELLS_ACROSS_RANGE),
    {
      key: 'averageSample',
      label: 'Average sample',
      type: 'bool',
      default: false,
    },
    {
      key: 'posterizeLevels',
      label: 'Posterize levels (0 = off)',
      type: 'int',
      min: 0,
      max: 16,
      step: 1,
      default: 0,
    },
    {
      key: 'duotone',
      label: 'Duotone',
      type: 'bool',
      default: false,
    },
    // SPEC.md §9 — brand palette landed (colors.ts); near-black + bright
    // yellow, a punchier duotone than the placeholder mint evoked.
    {
      key: 'bg',
      label: 'Duotone dark',
      type: 'color',
      default: '#081011',
    },
    {
      key: 'fg',
      label: 'Duotone light',
      type: 'color',
      default: '#FEFB53',
    },
  ],
  // SPEC.md §3.3 — cellsAcross is cells across the CANVAS width, so the
  // block grid is built from vUv (raw canvas-space UV), not from texUv —
  // block density stays constant across canvas sizes regardless of the
  // image's crop/pan/zoom state. uCanvasAspect keeps blocks square.
  fragSource: `
uniform float uCellsAcross;
${SECTIONED_SCALE_GLSL_UNIFORMS}
uniform bool uAverageSample;
uniform int uPosterizeLevels;
uniform bool uDuotone;
uniform vec3 uBg;
uniform vec3 uFg;

void main() {
  float cellsAcross = ${SECTIONED_SCALE_EXPR};
  vec2 cellSize = vec2(1.0 / cellsAcross, uCanvasAspect / cellsAcross);
  vec2 cellCoord = floor(vUv / cellSize);
  vec2 cellCenter = (cellCoord + 0.5) * cellSize;

  vec4 color;
  if (uAverageSample) {
    const int SAMPLES = 3;
    vec4 sum = vec4(0.0);
    for (int sy = 0; sy < SAMPLES; sy++) {
      for (int sx = 0; sx < SAMPLES; sx++) {
        vec2 offset = (vec2(float(sx), float(sy)) + 0.5) / float(SAMPLES) - 0.5;
        sum += sampleImage(cellCenter + offset * cellSize);
      }
    }
    color = sum / float(SAMPLES * SAMPLES);
  } else {
    color = sampleImage(cellCenter);
  }

  if (uPosterizeLevels > 1) {
    float levels = float(uPosterizeLevels);
    color.rgb = clamp(floor(color.rgb * levels) / (levels - 1.0), 0.0, 1.0);
  }

  if (uDuotone) {
    float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    color.rgb = mix(uBg, uFg, luminance);
  }

  fragColor = color;
}
`,
}
