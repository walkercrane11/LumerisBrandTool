import type { ShaderModule } from './types'
import { sectionedScaleUniforms, SECTIONED_SCALE_GLSL_UNIFORMS, SECTIONED_SCALE_EXPR } from './sectionedScale'

// SPEC.md §4.3 — decided: ordered (Bayer) dithering only, no error-diffusion
// (that's inherently sequential, can't be a per-pixel fragment shader).
// Params per SPEC.md §4.2: matrix type, levels, palette (fg/bg), contrast,
// cells across.
//
// QA pass — sectioned-scale toggle (sectionedScale.ts, shared with ASCII/
// Halftone/Pixelated): canvas splits into a fixed 2x2 grid, each quadrant
// using its own matrix scale instead of one global one.
const CELLS_ACROSS_RANGE = { min: 20, max: 400, step: 1, default: 120 }

export const ditherShader: ShaderModule = {
  id: 'dither',
  label: 'Dither',
  passes: 1,
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Matrix scale',
      type: 'float',
      unit: 'cellsAcross',
      ...CELLS_ACROSS_RANGE,
      visibleWhen: { key: 'sectioned', equals: false },
    },
    ...sectionedScaleUniforms(CELLS_ACROSS_RANGE),
    {
      key: 'matrixType',
      label: 'Matrix',
      type: 'enum',
      options: ['bayer2', 'bayer4', 'bayer8'],
      default: 'bayer4',
    },
    {
      key: 'levels',
      label: 'Levels',
      type: 'int',
      min: 2,
      max: 8,
      step: 1,
      default: 2,
    },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'float',
      min: 0.5,
      max: 3,
      step: 0.05,
      default: 1,
    },
    // SPEC.md §9 — brand palette landed (colors.ts); near-black olive on
    // cream, slightly warmer than Halftone's near-black for distinction.
    {
      key: 'fg',
      label: 'Foreground',
      type: 'color',
      default: '#212100',
    },
    {
      key: 'bg',
      label: 'Background',
      type: 'color',
      default: '#FFFAE9',
    },
  ],
  // SPEC.md §3.3 — cellsAcross is cells across the CANVAS width, same
  // block-grid approach as Pixelated: one luminance sample per dither cell,
  // quantized against the cell's Bayer-matrix threshold, then mapped to a
  // color between bg and fg.
  fragSource: `
uniform float uCellsAcross;
${SECTIONED_SCALE_GLSL_UNIFORMS}
uniform int uMatrixType; // 0 = bayer2, 1 = bayer4, 2 = bayer8
uniform int uLevels;
uniform float uContrast;
uniform vec3 uFg;
uniform vec3 uBg;

const float BAYER_2X2[4] = float[4](0.0, 2.0, 3.0, 1.0);
const float BAYER_4X4[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0
);
const float BAYER_8X8[64] = float[64](
   0.0, 32.0,  8.0, 40.0,  2.0, 34.0, 10.0, 42.0,
  48.0, 16.0, 56.0, 24.0, 50.0, 18.0, 58.0, 26.0,
  12.0, 44.0,  4.0, 36.0, 14.0, 46.0,  6.0, 38.0,
  60.0, 28.0, 52.0, 20.0, 62.0, 30.0, 54.0, 22.0,
   3.0, 35.0, 11.0, 43.0,  1.0, 33.0,  9.0, 41.0,
  51.0, 19.0, 59.0, 27.0, 49.0, 17.0, 57.0, 25.0,
  15.0, 47.0,  7.0, 39.0, 13.0, 45.0,  5.0, 37.0,
  63.0, 31.0, 55.0, 23.0, 61.0, 29.0, 53.0, 21.0
);

// Normalized threshold in (0,1) for this cell's position within its
// repeating matrix tile.
float bayerThreshold(vec2 cellCoord) {
  if (uMatrixType == 0) {
    ivec2 c = ivec2(mod(cellCoord, 2.0));
    return (BAYER_2X2[c.y * 2 + c.x] + 0.5) / 4.0;
  } else if (uMatrixType == 1) {
    ivec2 c = ivec2(mod(cellCoord, 4.0));
    return (BAYER_4X4[c.y * 4 + c.x] + 0.5) / 16.0;
  } else {
    ivec2 c = ivec2(mod(cellCoord, 8.0));
    return (BAYER_8X8[c.y * 8 + c.x] + 0.5) / 64.0;
  }
}

void main() {
  float cellsAcross = ${SECTIONED_SCALE_EXPR};
  vec2 cellSize = vec2(1.0 / cellsAcross, uCanvasAspect / cellsAcross);
  vec2 cellCoord = floor(vUv / cellSize);
  vec2 cellCenter = (cellCoord + 0.5) * cellSize;

  vec4 sampled = sampleImage(cellCenter);
  float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
  luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float threshold = bayerThreshold(cellCoord);
  float levels = float(uLevels);
  float scaled = luminance * (levels - 1.0);
  float base = floor(scaled);
  float frac = scaled - base;
  float level = frac > threshold ? base + 1.0 : base;
  level = clamp(level, 0.0, levels - 1.0);
  float t = levels > 1.0 ? level / (levels - 1.0) : level;

  fragColor = vec4(mix(uBg, uFg, t), sampled.a);
}
`,
}
