import type { ShaderModule } from './types'

// SPEC.md §4.2 — "same mechanism, shape atlas instead of glyphs." Revised
// after reviewing reference/pattern.png (Walker, 2026-08-10): the actual
// target isn't one shape scaling continuously by size — it's discrete
// tonal bands, each filled with a categorically DIFFERENT pattern
// (checkerboard, dots, diagonal stripes, small squares, solid), light to
// dark. That doesn't fit the #17 atlas approach (one shape stamped per
// luminance-sampling cell) — these patterns tile at their own frequency,
// independent of how finely luminance is sampled. Confirmed with Walker:
// build these procedurally (no assets needed, they're all cheap GLSL
// math), and treat the reference comp's specific 5 patterns as an
// example, not a mandate. #17's atlas infrastructure is unused here now,
// but stays valid — ASCII still needs it.
export const patternFillShader: ShaderModule = {
  id: 'pattern-fill',
  label: 'Pattern fill',
  passes: 1,
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Pattern scale',
      type: 'float',
      unit: 'cellsAcross',
      min: 10,
      max: 150,
      step: 1,
      default: 60,
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
  // Luminance is sampled per-pixel (not per-cell) so band edges follow the
  // source image's contours smoothly, matching the reference comp — the
  // cellsAcross grid only controls each pattern's own tiling frequency.
  //
  // rotationJitter rotates the whole pattern coordinate space by a fixed
  // angle (not a per-cell random jitter) — randomly rotating a tiling
  // pattern per-cell breaks its continuity into visible seams, so this is
  // a uniform "pattern angle" control instead, keeping the SPEC-documented
  // param meaningful without that artifact.
  fragSource: `
uniform float uCellsAcross;
uniform float uContrast;
uniform float uRotationJitter;
uniform bool uInvert;
uniform vec3 uFg;
uniform vec3 uBg;

const float BANDS = 5.0;

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

void main() {
  vec4 sampled = sampleImage(vUv);
  float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
  luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float density = 1.0 - luminance;
  if (uInvert) density = 1.0 - density;

  float band = min(floor(density * BANDS), BANDS - 1.0);

  vec2 cellSize = vec2(1.0 / uCellsAcross, uCanvasAspect / uCellsAcross);
  vec2 raw = vUv / cellSize;

  float angle = uRotationJitter * radians(45.0);
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 p = mat2(ca, sa, -sa, ca) * raw;

  float coverage;
  if (band < 0.5) {
    coverage = checkerPattern(p);
  } else if (band < 1.5) {
    coverage = dotsPattern(p);
  } else if (band < 2.5) {
    coverage = stripesPattern(p);
  } else if (band < 3.5) {
    coverage = smallSquaresPattern(p);
  } else {
    coverage = 1.0;
  }

  fragColor = vec4(mix(uBg, uFg, coverage), sampled.a);
}
`,
}
