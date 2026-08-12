import type { ShaderModule } from './types'
import { sectionedScaleUniforms, SECTIONED_SCALE_GLSL_UNIFORMS, SECTIONED_SCALE_EXPR } from './sectionedScale'

// SPEC.md §4.2 — dot pitch, dot shape (circle/square/line), screen angle,
// contrast, fg/bg. Multi-angle CMYK variant is explicitly "optional" —
// out of scope here.
//
// QA pass — sectioned-scale toggle (sectionedScale.ts, shared with ASCII/
// Pixelated/Dither): canvas splits into a rows x cols grid, each section's
// dot pitch interpolated between a low/high pair instead of one global value.
const CELLS_ACROSS_RANGE = { min: 10, max: 200, step: 1, default: 60 }

export const halftoneShader: ShaderModule = {
  id: 'halftone',
  label: 'Halftone',
  passes: 1,
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Dot pitch',
      type: 'float',
      unit: 'cellsAcross',
      ...CELLS_ACROSS_RANGE,
      visibleWhen: { key: 'sectioned', equals: false },
    },
    ...sectionedScaleUniforms(CELLS_ACROSS_RANGE),
    {
      key: 'dotShape',
      label: 'Shape',
      type: 'enum',
      options: ['circle', 'square', 'line'],
      default: 'circle',
    },
    {
      key: 'screenAngle',
      label: 'Screen angle',
      type: 'float',
      unit: 'degrees',
      min: 0,
      max: 90,
      step: 1,
      default: 15,
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
    // SPEC.md §9 — brand palette landed (colors.ts); near-black on cream.
    {
      key: 'fg',
      label: 'Foreground',
      type: 'color',
      default: '#081011',
    },
    {
      key: 'bg',
      label: 'Background',
      type: 'color',
      default: '#FFFAE9',
    },
  ],
  // SPEC.md §3.3 — cellsAcross (dot pitch) is canvas-relative. The grid is
  // built in an aspect-corrected "square" space (uCanvasAspect keeps dots
  // circular, not stretched), THEN rotated by screenAngle — rotating first
  // would make the angle depend on canvas aspect, which isn't what a screen
  // angle means.
  fragSource: `
uniform float uCellsAcross;
${SECTIONED_SCALE_GLSL_UNIFORMS}
uniform int uDotShape; // 0 = circle, 1 = square, 2 = line
uniform float uScreenAngle;
uniform float uContrast;
uniform vec3 uFg;
uniform vec3 uBg;

void main() {
  float cellsAcross = ${SECTIONED_SCALE_EXPR};
  float rad = radians(uScreenAngle);
  float c = cos(rad);
  float s = sin(rad);
  mat2 rot = mat2(c, s, -s, c);
  mat2 invRot = mat2(c, -s, s, c);

  vec2 scale = vec2(cellsAcross, cellsAcross / uCanvasAspect);
  vec2 pre = vUv * scale;
  vec2 rotated = rot * pre;

  vec2 cellCoord = floor(rotated);
  vec2 cellLocal = fract(rotated) - 0.5;

  // Cell center, mapped back through the inverse rotation and scale to
  // sample the actual image at the right spot.
  vec2 cellCenterUv = (invRot * (cellCoord + 0.5)) / scale;

  vec4 sampled = sampleImage(cellCenterUv);
  float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
  luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // Darker source luminance -> bigger dot/thicker line. Capped at the
  // cell's edge midpoint (distance 0.5 from center) — dots from neighboring
  // cells touch there at maximum darkness, which reads fine. Past that, a
  // circle SDF starts filling the cell's corners too (corner distance is
  // 0.5*sqrt(2) =~ 0.707), and once the whole square corner-to-corner is
  // inside the circle it reads as a cropped square, not a big circle.
  float size = (1.0 - luminance) * 0.5;
  float edge = 0.06;

  float coverage;
  if (uDotShape == 0) {
    coverage = 1.0 - smoothstep(size - edge, size + edge, length(cellLocal));
  } else if (uDotShape == 1) {
    vec2 d = abs(cellLocal);
    coverage = 1.0 - smoothstep(size - edge, size + edge, max(d.x, d.y));
  } else {
    coverage = 1.0 - smoothstep(size - edge, size + edge, abs(cellLocal.y));
  }

  fragColor = vec4(mix(uBg, uFg, coverage), sampled.a);
}
`,
}
