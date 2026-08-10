import { createProgram } from './shaderProgram'

// Single oversized triangle covering the viewport — no vertex buffer needed,
// gl_VertexID picks the corner. Standard fullscreen-quad-without-a-quad trick.
const VERTEX_SOURCE = `#version 300 es
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);
out vec2 vUv;
void main() {
  vec2 pos = positions[gl_VertexID];
  vUv = (pos + 1.0) * 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`

// Placeholder only — proves the render pipeline works. Real shaders (SPEC.md
// §4.1 ShaderModule contract) replace this in a later issue.
const PLACEHOLDER_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = vec4(vUv, 0.5, 1.0);
}
`

export interface Renderer {
  render: () => void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('WebGL2 is not supported in this browser')

  const program = createProgram(gl, VERTEX_SOURCE, PLACEHOLDER_FRAGMENT_SOURCE)
  const vao = gl.createVertexArray()

  // Arrow function, not a declaration — TS only retains the null-check
  // narrowing of `gl` across the closure this way.
  const render = () => {
    // SPEC.md §2.2 — canvas renders at true export dimensions, always.
    // The viewport always matches canvas.width/height exactly; there is no
    // separate preview-resolution render path.
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.bindVertexArray(vao)
    gl.useProgram(program)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  return { render }
}
