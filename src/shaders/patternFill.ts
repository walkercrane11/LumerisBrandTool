import type { ShaderModule } from './types'
import { createPatternAtlasSource } from './patternAtlas'
import pattern1Lightest from './patterns/1-lightest.svg?raw'
import pattern2Light from './patterns/2-light.svg?raw'
import pattern3MidLight from './patterns/3-mid-light.svg?raw'
import pattern4MidDark from './patterns/4-mid-dark.svg?raw'
import pattern5Dark from './patterns/5-dark.svg?raw'

// SPEC.md §4.2 — "same mechanism, shape atlas instead of glyphs." Revised
// several times after review against reference/pattern.png (Walker,
// 2026-08-10), then again per Walker's later QA passes:
//
// 1st revision: discrete tonal bands, each filled with a categorically
// DIFFERENT pattern (checkerboard, dots, diagonal stripes, small squares,
// solid), light to dark. Dropped the #17 atlas approach (these patterns
// tile at their own frequency, independent of luminance-sampling
// resolution) in favor of procedural GLSL — no texture assets needed.
//
// 2nd revision: "strict grid" (one luminance sample/band per cell,
// mosaic-style) and "pattern AND color drive the value scale" (each band
// gets its own bg/fg color pair).
//
// 3rd revision (QA pass): finer top-end grid, plus triangles and
// herringbone bands (7 total).
//
// 4th revision (this one) — Walker supplied 5 custom SVG pattern assets
// (src/shaders/patterns/) to fully replace the procedural bands 1-5, with
// band 6 as a flat solid fill for the darkest tonal range (6 bands total,
// down from 7 — no more herringbone/7th tier). Unlike the earlier
// procedural functions, these assets carry their own baked-in colors
// (brand-palette hex values) rather than being tinted through a per-band
// bg/fg picker, so the color pickers for bands 1-5 are gone; only band 6
// (solid, no asset) keeps one. Rasterized into a texture atlas at
// shader-compile time (patternAtlas.ts) — same "cell-based, sample an
// atlas" family as ASCII, just SVG-sourced instead of glyph-sourced.
const PATTERN_SVGS = [pattern1Lightest, pattern2Light, pattern3MidLight, pattern4MidDark, pattern5Dark]

export const patternFillShader: ShaderModule = {
  id: 'pattern-fill',
  label: 'Pattern fill',
  passes: 1,
  atlas: {
    cols: PATTERN_SVGS.length,
    rows: 1,
    cellCount: PATTERN_SVGS.length,
    createSource: createPatternAtlasSource(PATTERN_SVGS),
  },
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Grid cells across',
      type: 'float',
      unit: 'cellsAcross',
      min: 8,
      max: 200,
      step: 1,
      default: 25,
    },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'float',
      min: 0.5,
      max: 3,
      step: 0.05,
      default: 1.4,
    },
    {
      key: 'rotationJitter',
      label: 'Pattern angle',
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
    // Band 6 (darkest, solid) is the only band without a baked-in asset
    // color — bands 1-5 render their SVGs as designed.
    { key: 'band6Color', label: 'Band 6 (solid) color', type: 'color', default: '#081011' },
  ],
  // One coordinate grid now, canvas-relative per §3.3: cellCoord
  // (cellsAcross resolution) drives both the luminance sample/band
  // decision AND the pattern placement — one atlas motif fills each strict
  // cell exactly, no subdivision. (Earlier revision sampled the atlas at a
  // finer subdivided grid so each cell showed several repeats of its
  // pattern; Walker's QA on that: he wants one instance per cell, not a
  // packed 4x4 of it.)
  //
  // rotationJitter rotates the pattern coordinate by a fixed angle (not a
  // per-cell random jitter) — randomly rotating a tiling pattern per-cell
  // breaks it into visible seams, so this is a uniform "pattern angle"
  // instead.
  fragSource: `
uniform float uCellsAcross;
uniform float uContrast;
uniform float uRotationJitter;
uniform bool uInvert;
uniform vec3 uBand6Color;

const float BANDS = 6.0;
const float PATTERN_COUNT = 5.0;

void main() {
  vec2 cellSize = vec2(1.0 / uCellsAcross, uCanvasAspect / uCellsAcross);
  vec2 cellCoord = floor(vUv / cellSize);
  vec2 cellCenter = (cellCoord + 0.5) * cellSize;

  // Strict grid: one luminance sample, one band, per cell.
  vec4 sampled = sampleImage(cellCenter);
  float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
  luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float density = 1.0 - luminance;
  if (uInvert) density = 1.0 - density;

  float band = min(floor(density * BANDS), BANDS - 1.0);

  vec2 patternRaw = vUv / cellSize;
  float angle = uRotationJitter * radians(45.0);
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 p = mat2(ca, sa, -sa, ca) * patternRaw;

  vec3 color;
  if (band < PATTERN_COUNT - 0.5) {
    vec2 local = fract(p);
    vec2 atlasUv = (vec2(band, 0.0) + local) / vec2(uAtlasCols, uAtlasRows);
    color = texture(uAtlas, atlasUv).rgb;
  } else {
    color = uBand6Color;
  }

  fragColor = vec4(color, sampled.a);
}
`,
}
