import type { ShaderModule } from './types'

// SPEC.md §4.2's build-order note: "establish the multi-pass capability in
// the core before Riso." This proves the gl/renderer.ts plumbing (offscreen
// ping-pong targets, uPrevPass) with a trivial, easy-to-verify 2-pass
// shader — pass 1 inverts, pass 2 passes the result through unchanged, so
// the final output should be a straightforward color-inverted image.
//
// Not registered in shaders/index.ts's SHADER_MODULES — it's not a real
// user-facing shader, just infrastructure verification. Kept here (rather
// than deleted after testing) in case the multi-pass plumbing needs
// debugging later, or Riso's own test setup wants a similar scaffold.
export const multipassTestShader: ShaderModule = {
  id: 'multipass-test',
  label: 'Multi-pass test (dev only — not registered)',
  passes: 2,
  uniformSchema: [],
  fragSource: [
    // Pass 1: invert
    `
void main() {
  vec4 sampled = sampleImage(vUv);
  fragColor = vec4(1.0 - sampled.rgb, sampled.a);
}
`,
    // Pass 2: passthrough of pass 1's output
    `
void main() {
  fragColor = samplePrevPass(vUv);
}
`,
  ],
}
