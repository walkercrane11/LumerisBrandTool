import { createProgram } from './shaderProgram'
import type { ShaderModule, UniformValue } from '../shaders/types'

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
const PLACEHOLDER_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = vec4(vUv, 0.5, 1.0);
}
`

// Prepended to every ShaderModule's fragSource (SPEC.md §4.1). Gives shader
// modules vUv (canvas-space UV, before cover-fit), the cover-fit transform
// via sampleImage(), and uCanvasAspect for square-cell math — so a module's
// fragSource is just its own uniforms + main(), nothing about the render
// harness itself.
const PREAMBLE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uRatio;
uniform vec2 uPan;
uniform float uCanvasAspect;
out vec4 fragColor;

vec4 sampleImage(vec2 canvasUv) {
  vec2 texUv = vec2(0.5) + (canvasUv - vec2(0.5)) * uRatio - uPan;
  return texture(uImage, texUv);
}
`

export interface RenderTransform {
  ratioX: number
  ratioY: number
  panX: number
  panY: number
}

const IDENTITY_TRANSFORM: RenderTransform = { ratioX: 1, ratioY: 1, panX: 0, panY: 0 }

function uniformGlslName(key: string): string {
  return `u${key[0].toUpperCase()}${key.slice(1)}`
}

interface CompiledShader {
  program: WebGLProgram
  uImage: WebGLUniformLocation | null
  uRatio: WebGLUniformLocation | null
  uPan: WebGLUniformLocation | null
  uCanvasAspect: WebGLUniformLocation | null
  paramLocations: Map<string, WebGLUniformLocation | null>
}

function compileShaderModule(gl: WebGL2RenderingContext, module: ShaderModule): CompiledShader {
  // Multi-pass (Riso, passes 2|3) isn't wired up yet — a deliberate
  // architecture extension for later, per SPEC.md §4.2's build-order note.
  const fragBody = Array.isArray(module.fragSource) ? module.fragSource[0] : module.fragSource
  const program = createProgram(gl, VERTEX_SOURCE, PREAMBLE + fragBody)
  const paramLocations = new Map(
    module.uniformSchema.map((def) => [def.key, gl.getUniformLocation(program, uniformGlslName(def.key))]),
  )
  return {
    program,
    uImage: gl.getUniformLocation(program, 'uImage'),
    uRatio: gl.getUniformLocation(program, 'uRatio'),
    uPan: gl.getUniformLocation(program, 'uPan'),
    uCanvasAspect: gl.getUniformLocation(program, 'uCanvasAspect'),
    paramLocations,
  }
}

function setParam(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation | null,
  def: ShaderModule['uniformSchema'][number],
  value: UniformValue,
) {
  if (!location) return
  switch (def.type) {
    case 'float':
      gl.uniform1f(location, Number(value))
      break
    case 'int':
      gl.uniform1i(location, Math.round(Number(value)))
      break
    case 'bool':
      gl.uniform1i(location, value ? 1 : 0)
      break
    case 'enum': {
      const index = def.options?.indexOf(String(value)) ?? -1
      gl.uniform1i(location, Math.max(0, index))
      break
    }
    case 'color':
      // Brand palette values are still TBD (SPEC.md §9) — nothing to upload
      // yet. No shader currently declares a color uniform.
      break
  }
}

export interface Renderer {
  render: (options?: {
    shader: ShaderModule
    values: Record<string, UniformValue>
    transform?: RenderTransform
  }) => void
  setImage: (source: TexImageSource) => void
}

export function createRenderer(canvas: HTMLCanvasElement, shaderModules: ShaderModule[]): Renderer {
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('WebGL2 is not supported in this browser')

  const placeholderProgram = createProgram(gl, VERTEX_SOURCE, PLACEHOLDER_FRAGMENT_SOURCE)
  const compiled = new Map(shaderModules.map((module) => [module.id, compileShaderModule(gl, module)]))

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

  const render: Renderer['render'] = (options) => {
    // SPEC.md §2.2 — canvas renders at true export dimensions, always.
    // The viewport always matches canvas.width/height exactly; there is no
    // separate preview-resolution render path.
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.bindVertexArray(vao)

    if (hasImage && options) {
      const shaderProgram = compiled.get(options.shader.id)
      if (!shaderProgram) throw new Error(`Unknown shader id: ${options.shader.id}`)
      const transform = options.transform ?? IDENTITY_TRANSFORM

      gl.useProgram(shaderProgram.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(shaderProgram.uImage, 0)
      gl.uniform2f(shaderProgram.uRatio, transform.ratioX, transform.ratioY)
      gl.uniform2f(shaderProgram.uPan, transform.panX, transform.panY)
      gl.uniform1f(shaderProgram.uCanvasAspect, canvas.width / canvas.height)

      for (const def of options.shader.uniformSchema) {
        setParam(gl, shaderProgram.paramLocations.get(def.key) ?? null, def, options.values[def.key])
      }
    } else {
      gl.useProgram(placeholderProgram)
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  return { render, setImage }
}
