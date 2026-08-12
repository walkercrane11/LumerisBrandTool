import type { ShaderModule } from './types'

// SPEC.md §4.2 — "same mechanism, shape atlas instead of glyphs." Revised
// twice after review against reference/pattern.png (Walker, 2026-08-10):
//
// 1st revision: discrete tonal bands, each filled with a categorically
// DIFFERENT pattern (checkerboard, dots, diagonal stripes, small squares,
// solid), light to dark — not one shape scaling continuously by size.
// Dropped the #17 atlas approach (these patterns tile at their own
// frequency, independent of luminance-sampling resolution) in favor of
// procedural GLSL — no texture assets needed.
//
// 2nd revision — two more notes from Walker on the 1st pass:
// - "strict grid": band assignment now samples luminance once per cell
//   (mosaic-style, like Halftone/Dither/ASCII), not per-pixel. Band edges
//   are blocky/grid-aligned now, not following the photo's smooth contours.
// - "pattern AND color drive the value scale": each band gets its own
//   bg/fg color pair (10 colors total) instead of one shared fg/bg —
//   closer to the reference comp's actual richness (it uses roughly two
//   colors per tonal region, not one accent color throughout).
//
// 3rd revision (QA pass) — Walker asked for a finer top-end grid (cells
// across max 80 -> 200) and two more pattern elements. No reference comp
// for the two new ones (unlike everything else in this file), so picked
// from a curated set Walker approved: triangles and herringbone. Inserted
// as bands 5 and 6, pushing the former band5 (solid) to band7 — the other
// four keep their existing keys/colors untouched.
export const patternFillShader: ShaderModule = {
  id: 'pattern-fill',
  label: 'Pattern fill',
  passes: 1,
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
    // SPEC.md §9 — brand palette landed (colors.ts). Light bands stay
    // high-key (cream/yellow, sage/olive), middle bands carry the two
    // vivid accents (red, blue) for visual interest, dark bands move
    // through the earthy/moody colors down to near-black at band 7 (whose
    // bg is barely visible — that band's coverage is always 1.0, see
    // fragSource — but still set to something reasonable).
    { key: 'band1Bg', label: 'Band 1 (checker) bg', type: 'color', default: '#FFFAE9' },
    { key: 'band1Fg', label: 'Band 1 (checker) fg', type: 'color', default: '#FEFB53' },
    { key: 'band2Bg', label: 'Band 2 (dots) bg', type: 'color', default: '#CBCF92' },
    { key: 'band2Fg', label: 'Band 2 (dots) fg', type: 'color', default: '#8A8800' },
    { key: 'band3Bg', label: 'Band 3 (stripes) bg', type: 'color', default: '#FF453B' },
    { key: 'band3Fg', label: 'Band 3 (stripes) fg', type: 'color', default: '#FFFAE9' },
    { key: 'band4Bg', label: 'Band 4 (squares) bg', type: 'color', default: '#1836F0' },
    { key: 'band4Fg', label: 'Band 4 (squares) fg', type: 'color', default: '#FEFB53' },
    { key: 'band5Bg', label: 'Band 5 (triangles) bg', type: 'color', default: '#433209' },
    { key: 'band5Fg', label: 'Band 5 (triangles) fg', type: 'color', default: '#CBCF92' },
    { key: 'band6Bg', label: 'Band 6 (herringbone) bg', type: 'color', default: '#0E1F6A' },
    { key: 'band6Fg', label: 'Band 6 (herringbone) fg', type: 'color', default: '#530E06' },
    { key: 'band7Bg', label: 'Band 7 (solid) bg', type: 'color', default: '#212100' },
    { key: 'band7Fg', label: 'Band 7 (solid) fg', type: 'color', default: '#081011' },
  ],
  // Two coordinate grids, both canvas-relative per §3.3:
  // - cellCoord (cellsAcross resolution): the STRICT grid. One luminance
  //   sample and one band decision per cell — the whole cell renders
  //   uniformly, mosaic-style.
  // - patternCoord (cellsAcross * PATTERN_SUBDIV): finer, purely for the
  //   pattern's own texture, so each band cell shows several repeats of
  //   its pattern (a mini checkerboard, a few dots, etc.) rather than at
  //   most one shape per cell.
  //
  // rotationJitter rotates patternCoord by a fixed angle (not a per-cell
  // random jitter) — randomly rotating a tiling pattern per-cell breaks it
  // into visible seams, so this is a uniform "pattern angle" instead.
  fragSource: `
uniform float uCellsAcross;
uniform float uContrast;
uniform float uRotationJitter;
uniform bool uInvert;
uniform vec3 uBand1Bg;
uniform vec3 uBand1Fg;
uniform vec3 uBand2Bg;
uniform vec3 uBand2Fg;
uniform vec3 uBand3Bg;
uniform vec3 uBand3Fg;
uniform vec3 uBand4Bg;
uniform vec3 uBand4Fg;
uniform vec3 uBand5Bg;
uniform vec3 uBand5Fg;
uniform vec3 uBand6Bg;
uniform vec3 uBand6Fg;
uniform vec3 uBand7Bg;
uniform vec3 uBand7Fg;

const float BANDS = 7.0;
const float PATTERN_SUBDIV = 4.0;

float checkerPattern(vec2 p) {
  vec2 cell = floor(p);
  return mod(cell.x + cell.y, 2.0);
}

float dotsPattern(vec2 p) {
  vec2 local = fract(p) - 0.5;
  return 1.0 - smoothstep(0.15, 0.22, length(local));
}

float stripesPattern(vec2 p) {
  float diag = p.x + p.y;
  return step(0.5, fract(diag));
}

float smallSquaresPattern(vec2 p) {
  vec2 local = fract(p * 2.0) - 0.5;
  vec2 d = abs(local);
  return 1.0 - step(0.32, max(d.x, d.y));
}

// One upward-pointing triangle per cell (apex at top-center, base along
// the bottom edge). A single diagonal split per cell reads as plain
// stripes once tiled (checked empirically — an earlier alternating-
// diagonal-split version was visually indistinguishable from
// stripesPattern); a self-contained triangle silhouette per cell doesn't
// have that ambiguity.
float trianglesPattern(vec2 p) {
  vec2 local = fract(p);
  float halfWidthAtHeight = 0.5 * (1.0 - local.y);
  return step(abs(local.x - 0.5), halfWidthAtHeight);
}

// Herringbone weave approximation: space divides into 2x2 blocks, each
// block using one of two opposite diagonal stripe directions (forward or back slash),
// picked by block parity — reads as a woven zigzag rather than a literal
// mitered herringbone join, but distinct from the single-direction stripes
// pattern and from the triangle tiling above.
float herringbonePattern(vec2 p) {
  vec2 blockCell = floor(p * 0.5);
  float blockParity = mod(blockCell.x + blockCell.y, 2.0);
  float diagA = step(0.5, fract(p.x + p.y));
  float diagB = step(0.5, fract(p.x - p.y));
  return mix(diagA, diagB, blockParity);
}

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

  vec2 patternRaw = (vUv / cellSize) * PATTERN_SUBDIV;
  float angle = uRotationJitter * radians(45.0);
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 p = mat2(ca, sa, -sa, ca) * patternRaw;

  float coverage;
  vec3 bandBg;
  vec3 bandFg;
  if (band < 0.5) {
    coverage = checkerPattern(p);
    bandBg = uBand1Bg;
    bandFg = uBand1Fg;
  } else if (band < 1.5) {
    coverage = dotsPattern(p);
    bandBg = uBand2Bg;
    bandFg = uBand2Fg;
  } else if (band < 2.5) {
    coverage = stripesPattern(p);
    bandBg = uBand3Bg;
    bandFg = uBand3Fg;
  } else if (band < 3.5) {
    coverage = smallSquaresPattern(p);
    bandBg = uBand4Bg;
    bandFg = uBand4Fg;
  } else if (band < 4.5) {
    coverage = trianglesPattern(p);
    bandBg = uBand5Bg;
    bandFg = uBand5Fg;
  } else if (band < 5.5) {
    coverage = herringbonePattern(p);
    bandBg = uBand6Bg;
    bandFg = uBand6Fg;
  } else {
    coverage = 1.0;
    bandBg = uBand7Bg;
    bandFg = uBand7Fg;
  }

  fragColor = vec4(mix(bandBg, bandFg, coverage), sampled.a);
}
`,
}
