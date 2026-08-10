import type { ShaderModule } from './types'
import { createSquareAtlasSource } from './shapeAtlas'

const LEVELS = 8

// SPEC.md §4.2 — "same mechanism, shape atlas instead of glyphs." Params:
// cells across, shape set, rotation jitter, invert, fg/bg (+ contrast,
// same addition made to ASCII after Walker's feedback on #17 — the flat
// linear luminance mapping without it rarely reached either tonal
// extreme). No "shape set" control — only one ramp exists yet, same
// reasoning as ASCII's glyphSet and Pixelated's sampleMode: nothing to
// pick between until there's a second option.
export const patternFillShader: ShaderModule = {
  id: 'pattern-fill',
  label: 'Pattern fill',
  passes: 1,
  atlas: {
    cols: LEVELS,
    rows: 1,
    cellCount: LEVELS,
    createSource: createSquareAtlasSource(64, LEVELS),
  },
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Cell size',
      type: 'float',
      unit: 'cellsAcross',
      min: 10,
      max: 150,
      step: 1,
      default: 50,
    },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'float',
      min: 0.5,
      max: 3,
      step: 0.05,
      default: 1.5,
    },
    {
      key: 'rotationJitter',
      label: 'Rotation jitter',
      type: 'float',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0,
    },
    {
      key: 'invert',
      label: 'Invert',
      type: 'bool',
      default: false,
    },
    {
      key: 'fg',
      label: 'Foreground',
      type: 'color',
      default: '#111111',
    },
    {
      key: 'bg',
      label: 'Background',
      type: 'color',
      default: '#f4f1ea',
    },
  ],
  // Deliberately near-identical to ascii.ts's cell/atlas-lookup math —
  // that's the point (SPEC §4.2: "same atlas pipeline with a different
  // texture"). The only real addition is per-cell rotation jitter, applied
  // to the local sample point before the atlas lookup rather than to the
  // whole grid (contrast Halftone's global screen angle). Rotating can
  // push a corner outside the cell's own [0,1] UV range, which would
  // sample into a neighboring atlas cell (a different-sized square) if
  // left unclamped — so the rotated point is clamped back into range,
  // meaning a jittered square clips at its own cell boundary at most,
  // never bleeds into its neighbor's.
  fragSource: `
uniform float uCellsAcross;
uniform float uContrast;
uniform float uRotationJitter;
uniform bool uInvert;
uniform vec3 uFg;
uniform vec3 uBg;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 cellSize = vec2(1.0 / uCellsAcross, uCanvasAspect / uCellsAcross);
  vec2 cellCoord = floor(vUv / cellSize);
  vec2 cellLocal = fract(vUv / cellSize);
  vec2 cellCenter = (cellCoord + 0.5) * cellSize;

  vec4 sampled = sampleImage(cellCenter);
  float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
  luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float density = 1.0 - luminance;
  if (uInvert) density = 1.0 - density;

  vec2 centered = cellLocal - 0.5;
  float angle = (hash(cellCoord) - 0.5) * uRotationJitter * radians(90.0);
  float ca = cos(angle);
  float sa = sin(angle);
  mat2 jitterRot = mat2(ca, sa, -sa, ca);
  vec2 rotatedLocal = clamp(jitterRot * centered + 0.5, 0.0, 1.0);

  float cellCount = uAtlasCols * uAtlasRows;
  float index = floor(density * (cellCount - 1.0) + 0.5);
  vec2 atlasCell = vec2(mod(index, uAtlasCols), floor(index / uAtlasCols));
  vec2 atlasUv = (atlasCell + rotatedLocal) / vec2(uAtlasCols, uAtlasRows);

  vec4 shape = texture(uAtlas, atlasUv);
  fragColor = vec4(mix(uBg, uFg, shape.a), sampled.a);
}
`,
}
