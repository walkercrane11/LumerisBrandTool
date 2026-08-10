import type { ShaderModule } from './types'

// SPEC.md §4.2 — "block average or nearest sample." Params: cells across,
// sample mode, optional posterize levels. Sample mode is genuinely binary
// (spec text: "block average OR nearest sample"), so it's a bool rather
// than reaching for the enum type — see SPEC.md §4.1's `options` note.
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
      min: 4,
      max: 300,
      step: 1,
      default: 60,
    },
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
  ],
  // SPEC.md §3.3 — cellsAcross is cells across the CANVAS width, so the
  // block grid is built from vUv (raw canvas-space UV), not from texUv —
  // block density stays constant across canvas sizes regardless of the
  // image's crop/pan/zoom state. uCanvasAspect keeps blocks square.
  fragSource: `
uniform float uCellsAcross;
uniform bool uAverageSample;
uniform int uPosterizeLevels;

void main() {
  vec2 cellSize = vec2(1.0 / uCellsAcross, uCanvasAspect / uCellsAcross);
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

  fragColor = color;
}
`,
}
