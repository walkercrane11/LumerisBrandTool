import type { ShaderModule } from './types'
import { createGlyphAtlasSource } from './glyphAtlas'

// SPEC.md §4.2 — decided: standard ASCII character set, no T/O/M-specific
// glyphs. Classic luminance-ordered ramp, sparsest (space) to densest (@).
const GLYPH_RAMP = ' .:-=+*#%@'

// SPEC.md §4.2 — cells across, glyph set, fg/bg, gamma, invert. Only one
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
    createSource: createGlyphAtlasSource(GLYPH_RAMP),
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
      default: 40,
    },
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
uniform float uGamma;
uniform bool uInvert;
uniform vec3 uFg;
uniform vec3 uBg;

void main() {
  vec2 cellSize = vec2(1.0 / uCellsAcross, uCanvasAspect / uCellsAcross);
  vec2 cellCoord = floor(vUv / cellSize);
  vec2 cellLocal = fract(vUv / cellSize);
  vec2 cellCenter = (cellCoord + 0.5) * cellSize;

  vec4 sampled = sampleImage(cellCenter);
  float luminance = clamp(pow(dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722)), uGamma), 0.0, 1.0);

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
