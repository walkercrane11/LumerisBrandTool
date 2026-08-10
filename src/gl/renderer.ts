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

// Shown before an image is uploaded — proves the render pipeline works.
// Real shaders (SPEC.md §4.1 ShaderModule contract) arrive in a later issue.
const PLACEHOLDER_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = vec4(vUv, 0.5, 1.0);
}
`

// Identity passthrough — samples the uploaded image with no treatment.
// Stretches to the canvas aspect ratio; cover-fit/crop is #3, not this issue.
const IMAGE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImage;
out vec4 fragColor;
void main() {
  fragColor = texture(uImage, vUv);
}
`

export interface Renderer {
  render: () => void
  setImage: (source: TexImageSource) => void
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('WebGL2 is not supported in this browser')

  const placeholderProgram = createProgram(gl, VERTEX_SOURCE, PLACEHOLDER_FRAGMENT_SOURCE)
  const imageProgram = createProgram(gl, VERTEX_SOURCE, IMAGE_FRAGMENT_SOURCE)
  const imageUniformLocation = gl.getUniformLocation(imageProgram, 'uImage')

  const vao = gl.createVertexArray()
  const texture = gl.createTexture()

  let hasImage = false

  // Arrow functions, not declarations — TS only retains the null-check
  // narrowing of `gl` across the closure this way.
  const setImage = (source: TexImageSource) => {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // Images decode with a top-left origin; WebGL texture coords are
    // bottom-left. Flip on upload so the image renders right-side up.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    hasImage = true
  }

  const render = () => {
    // SPEC.md §2.2 — canvas renders at true export dimensions, always.
    // The viewport always matches canvas.width/height exactly; there is no
    // separate preview-resolution render path.
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.bindVertexArray(vao)

    if (hasImage) {
      gl.useProgram(imageProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(imageUniformLocation, 0)
    } else {
      gl.useProgram(placeholderProgram)
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  return { render, setImage }
}
