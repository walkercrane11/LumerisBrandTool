import type { ShaderModule } from './types'
import { createGlyphAtlasSource } from './glyphAtlas'
import { sectionedScaleUniforms, SECTIONED_SCALE_GLSL_UNIFORMS, SECTIONED_SCALE_EXPR } from './sectionedScale'

// SPEC.md §4.2 — decided: standard ASCII character set, no T/O/M-specific
// glyphs. Classic 70-character luminance-ordered ramp (Paul Bourke's
// grayscale set, widely used in ASCII-art converters), sparsest (space) to
// densest ($) — the shader below maps low density to low index, so this
// has to run sparse-to-dense, same direction as the original 10-char ramp;
// it's usually quoted dense-to-sparse, and the reversed version rendered
// inverted (bright regions in `$`/`@`, dark regions in space) until caught
// by checking the actual render, not just the math. Walker's QA feedback
// on the original 10-character ramp: too coarse — this gives 7x the
// luminance resolution.
const GLYPH_RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$'

// QA pass — sectioned-scale toggle (sectionedScale.ts, shared with
// Halftone/Pixelated/Dither): canvas splits into a fixed 2x2 grid, each
// quadrant using its own cell size instead of one global one.
const CELLS_ACROSS_RANGE = { min: 10, max: 150, step: 1, default: 70 }

// SPEC.md §4.2 — cells across, glyph set, fg/bg, gamma, invert; contrast
// added per Walker's feedback on #17 (updated in SPEC.md too). Only one
// glyph set exists right now (the ramp above), so — same call as
// Pixelated's sampleMode — there's nothing for a "glyph set" control to
// select yet; it's not in uniformSchema until there's a second set to pick
// between.
export const asciiShader: ShaderModule = {
  id: 'ascii',
  label: 'ASCII',
  passes: 1,
  atlas: {
    cols: GLYPH_RAMP.length,
    rows: 1,
    cellCount: GLYPH_RAMP.length,
    // 32px cells, not the default 64px — at 70 glyphs, 64px cells would
    // make the atlas 4480px wide, over the 4096px MAX_TEXTURE_SIZE floor
    // some GPUs guarantee under WebGL2. 32px keeps it at 2240px, safely
    // under any reasonable hardware limit, with no visible legibility loss
    // (glyphs are bilinear-sampled up to whatever the on-canvas cell size
    // ends up being anyway).
    createSource: createGlyphAtlasSource(GLYPH_RAMP, 32),
  },
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Cell size',
      type: 'float',
      unit: 'cellsAcross',
      ...CELLS_ACROSS_RANGE,
      visibleWhen: { key: 'sectioned', equals: false },
    },
    ...sectionedScaleUniforms(CELLS_ACROSS_RANGE),
    {
      key: 'gamma',
      label: 'Gamma',
      type: 'float',
      min: 0.2,
      max: 3,
      step: 0.05,
      default: 1,
    },
    {
      key: 'contrast',
      label: 'Contrast',
      type: 'float',
      min: 0.5,
      max: 3,
      step: 0.05,
      default: 1.6,
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
  // SPEC.md §3.3 — cellsAcross is canvas-relative, same square-cell approach
  // as the other cell-based shaders. uAtlas/uAtlasCols/uAtlasRows are set by
  // the render core from this module's `atlas` field (gl/renderer.ts), not
  // user-editable — they describe the texture, not a tunable parameter.
  fragSource: `
uniform float uCellsAcross;
${SECTIONED_SCALE_GLSL_UNIFORMS}
uniform float uGamma;
uniform float uContrast;
uniform bool uInvert;
uniform vec3 uFg;
uniform vec3 uBg;

void main() {
  float cellsAcross = ${SECTIONED_SCALE_EXPR};
  vec2 cellSize = vec2(1.0 / cellsAcross, uCanvasAspect / cellsAcross);
  vec2 cellCoord = floor(vUv / cellSize);
  vec2 cellLocal = fract(vUv / cellSize);
  vec2 cellCenter = (cellCoord + 0.5) * cellSize;

  vec4 sampled = sampleImage(cellCenter);
  float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
  // Stretch around the midpoint before gamma, same as Dither/Halftone's
  // contrast — pushes shadows darker and highlights lighter so the full
  // glyph ramp (space to @) actually gets used, not just the middle of it.
  luminance = clamp((luminance - 0.5) * uContrast + 0.5, 0.0, 1.0);
  luminance = clamp(pow(luminance, uGamma), 0.0, 1.0);

  // Dark source -> dense glyph by default; invert flips that.
  float density = 1.0 - luminance;
  if (uInvert) density = 1.0 - density;

  float cellCount = uAtlasCols * uAtlasRows;
  float index = floor(density * (cellCount - 1.0) + 0.5);
  vec2 atlasCell = vec2(mod(index, uAtlasCols), floor(index / uAtlasCols));
  vec2 atlasUv = (atlasCell + cellLocal) / vec2(uAtlasCols, uAtlasRows);

  vec4 glyph = texture(uAtlas, atlasUv);
  fragColor = vec4(mix(uBg, uFg, glyph.a), sampled.a);
}
`,
}
