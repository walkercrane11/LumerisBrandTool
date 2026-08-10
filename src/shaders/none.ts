import type { ShaderModule } from './types'

// SPEC.md §4.1 — "none is a shader module, not a special case." Identity
// passthrough: the untreated image, needed for the Riso/none-only Dot and
// Square vector pairings in §4.5.
export const noneShader: ShaderModule = {
  id: 'none',
  label: 'None',
  passes: 1,
  uniformSchema: [],
  fragSource: `
void main() {
  fragColor = sampleImage(vUv);
}
`,
}
