import type { ShaderModule } from './types'

// SPEC.md §4.2 — Riso: channel separation into 2-3 ink layers, per-layer
// misregistration offset, overprint (multiply) blending, plus grain. "The
// outlier... cannot be a single fragment shader" — this is the first real
// consumer of #19's multi-pass architecture.
//
// Design grounded in reference/riso.png (same source photo as
// test-image.jpg, per the established pattern of checking references
// before building — see Pattern fill's redesign history): the actual
// target isn't a flat 2-3 color duotone/posterize, it's a fine halftone
// SCREEN per ink channel, each at its own angle (classic process-printing
// convention to avoid moiré between overlapping screens), overprinted —
// much closer to CMY halftone color reproduction than a simple duotone.
// Reuses the exact per-layer dot-rendering math from halftone.ts (rotated
// grid, circular dot sized by density), just three of them at different
// angles/inks/offsets, chained through #19's ping-pong passes.
interface RisoLayer {
  index: 1 | 2 | 3
  angleDeg: number
  offsetDir: readonly [number, number]
  channel: 'r' | 'g' | 'b'
  grainSeed: number
}

// Angles follow the classic 3-ink process-printing convention (distinct
// angles per ink minimize moiré where the screens overlap).
const LAYERS: RisoLayer[] = [
  { index: 1, angleDeg: 15, offsetDir: [-1, 0.5], channel: 'r', grainSeed: 11.7 },
  { index: 2, angleDeg: 75, offsetDir: [1, 0.5], channel: 'g', grainSeed: 47.3 },
  { index: 3, angleDeg: 0, offsetDir: [0, -1], channel: 'b', grainSeed: 91.1 },
]

function risoPassSource(layer: RisoLayer): string {
  const { index, angleDeg, offsetDir, channel, grainSeed } = layer
  const isFirstPass = index === 1

  return `
uniform vec3 uInk${index}Color;
uniform int uSeparationMode; // 0 = channels, 1 = luminance
uniform float uCellsAcross;
uniform float uOffsetAmount;
uniform float uGrainAmount;
uniform float uLayerOpacity;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 offsetDir = vec2(${offsetDir[0].toFixed(2)}, ${offsetDir[1].toFixed(2)} / uCanvasAspect);
  vec2 sampleUv = vUv + offsetDir * uOffsetAmount;

  // Halftone screen at this layer's own angle — same rotated-grid math as
  // halftone.ts, one sample per dot cell.
  float rad = radians(${angleDeg.toFixed(1)});
  float c = cos(rad);
  float s = sin(rad);
  mat2 rot = mat2(c, s, -s, c);
  mat2 invRot = mat2(c, -s, s, c);
  vec2 scale = vec2(uCellsAcross, uCellsAcross / uCanvasAspect);
  vec2 pre = sampleUv * scale;
  vec2 rotated = rot * pre;
  vec2 cellCoord = floor(rotated);
  vec2 cellLocal = fract(rotated) - 0.5;
  vec2 cellCenterUv = (invRot * (cellCoord + 0.5)) / scale;

  vec4 sampled = sampleImage(cellCenterUv);

  float density;
  if (uSeparationMode == 0) {
    density = 1.0 - sampled.${channel};
  } else {
    float luminance = dot(sampled.rgb, vec3(0.2126, 0.7152, 0.0722));
    density = 1.0 - luminance;
  }

  // Max 0.5 (cell edge midpoint), same reasoning as halftone.ts — a circle
  // past that starts filling the cell's corners and reads as a square.
  float size = density * 0.5;
  float edge = 0.06;
  float coverage = 1.0 - smoothstep(size - edge, size + edge, length(cellLocal));

  vec2 grainUv = vec2(vUv.x, vUv.y / uCanvasAspect) * 400.0;
  float grain = (hash21(floor(grainUv) + ${grainSeed.toFixed(1)}) - 0.5) * uGrainAmount;
  coverage = clamp(coverage + grain, 0.0, 1.0) * uLayerOpacity;

  vec3 base = ${isFirstPass ? 'vec3(1.0)' : 'samplePrevPass(vUv).rgb'};
  vec3 result = mix(base, base * uInk${index}Color, coverage);
  fragColor = vec4(result, 1.0);
}
`
}

// Traditional process-printing cyan/magenta/yellow — the same values this
// shader's ink defaults used before the brand palette landed. Offered as
// extraSwatches on the ink color params (below) rather than restored as
// the defaults, so both options are available side by side.
const CMY_SWATCHES = ['#00AEEF', '#EC008C', '#FFF200']

export const risoShader: ShaderModule = {
  id: 'riso',
  label: 'Riso',
  passes: 3,
  uniformSchema: [
    {
      key: 'cellsAcross',
      label: 'Screen fineness',
      type: 'float',
      unit: 'cellsAcross',
      min: 40,
      max: 300,
      step: 1,
      default: 150,
    },
    {
      key: 'separationMode',
      label: 'Separation mode',
      type: 'enum',
      options: ['channels', 'luminance'],
      default: 'channels',
    },
    {
      key: 'offsetAmount',
      label: 'Misregistration',
      type: 'float',
      unit: 'normalized',
      min: 0,
      max: 0.02,
      step: 0.001,
      default: 0.004,
    },
    {
      key: 'grainAmount',
      label: 'Grain',
      type: 'float',
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.15,
    },
    {
      key: 'layerOpacity',
      label: 'Layer opacity',
      type: 'float',
      min: 0.5,
      max: 1,
      step: 0.05,
      default: 0.9,
    },
    // SPEC.md §9 — brand palette landed (colors.ts). Defaults to on-brand
    // blue/red/yellow, but Walker also asked for traditional process CMY
    // available here specifically — real full-color reconstruction fidelity
    // in 'channels' mode needs true cyan/magenta (each channel's inverse),
    // which the brand palette doesn't have. `extraSwatches` appends them
    // after the brand set for these three params only, not app-wide — the
    // locked-palette policy (§4.1) still holds everywhere else.
    { key: 'ink1Color', label: 'Ink 1', type: 'color', default: '#1836F0', extraSwatches: CMY_SWATCHES },
    { key: 'ink2Color', label: 'Ink 2', type: 'color', default: '#FF453B', extraSwatches: CMY_SWATCHES },
    { key: 'ink3Color', label: 'Ink 3', type: 'color', default: '#FEFB53', extraSwatches: CMY_SWATCHES },
  ],
  fragSource: LAYERS.map(risoPassSource),
}
