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

// Prepended to every pass of every ShaderModule's fragSource (SPEC.md
// §4.1). Gives shader modules vUv (canvas-space UV, before cover-fit), the
// cover-fit transform via sampleImage(), uCanvasAspect for square-cell
// math, and — for multi-pass shaders (SPEC.md §4.2, Riso) — uPrevPass via
// samplePrevPass() to read the previous pass's output directly (no
// cover-fit transform needed there; it's already exact canvas resolution,
// 1:1 with vUv). Single-pass modules just never reference it.
const PREAMBLE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uRatio;
uniform vec2 uPan;
uniform float uCanvasAspect;
uniform sampler2D uAtlas;
uniform float uAtlasCols;
uniform float uAtlasRows;
uniform sampler2D uPrevPass;
out vec4 fragColor;

vec4 sampleImage(vec2 canvasUv) {
  vec2 texUv = vec2(0.5) + (canvasUv - vec2(0.5)) * uRatio - uPan;
  return texture(uImage, texUv);
}

vec4 samplePrevPass(vec2 canvasUv) {
  return texture(uPrevPass, canvasUv);
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

// #rrggbb -> [0,1] floats. Only format the color UI produces (native
// <input type="color">, or the future brand-palette swatch picker).
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255
  return [r, g, b]
}

interface CompiledPass {
  program: WebGLProgram
  uImage: WebGLUniformLocation | null
  uRatio: WebGLUniformLocation | null
  uPan: WebGLUniformLocation | null
  uCanvasAspect: WebGLUniformLocation | null
  uAtlas: WebGLUniformLocation | null
  uAtlasCols: WebGLUniformLocation | null
  uAtlasRows: WebGLUniformLocation | null
  uPrevPass: WebGLUniformLocation | null
  paramLocations: Map<string, WebGLUniformLocation | null>
}

interface CompiledShader {
  passes: CompiledPass[]
  atlasTexture: WebGLTexture | null
  atlasCols: number
  atlasRows: number
}

function compilePass(gl: WebGL2RenderingContext, module: ShaderModule, fragBody: string): CompiledPass {
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
    uAtlas: gl.getUniformLocation(program, 'uAtlas'),
    uAtlasCols: gl.getUniformLocation(program, 'uAtlasCols'),
    uAtlasRows: gl.getUniformLocation(program, 'uAtlasRows'),
    uPrevPass: gl.getUniformLocation(program, 'uPrevPass'),
    paramLocations,
  }
}

function compileShaderModule(gl: WebGL2RenderingContext, module: ShaderModule): CompiledShader {
  // SPEC.md §4.1 — fragSource is one string per pass. Single-pass modules
  // (everything except Riso) just get a one-entry passes array; the render
  // loop below treats both cases identically, so this was additive to the
  // single-pass path, not a rewrite of it.
  const fragSources = Array.isArray(module.fragSource) ? module.fragSource : [module.fragSource]
  const passes = fragSources.map((fragBody) => compilePass(gl, module, fragBody))

  // Cell-based shaders (ASCII, Pattern fill — SPEC.md §4.2) declare an
  // atlas; everything else leaves this null and the uAtlas/* uniforms in
  // the preamble just go unused (GLSL optimizes them away, getUniformLocation
  // returns null, and WebGL silently no-ops uniform calls with a null
  // location — no branch needed here for "does this shader have an atlas").
  let atlasTexture: WebGLTexture | null = null
  if (module.atlas) {
    atlasTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, module.atlas.createSource())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  }

  return {
    passes,
    atlasTexture,
    atlasCols: module.atlas?.cols ?? 1,
    atlasRows: module.atlas?.rows ?? 1,
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
    case 'color': {
      // Uniform declared as vec3 — color uniforms carry no alpha.
      const [r, g, b] = hexToRgb(String(value))
      gl.uniform3f(location, r, g, b)
      break
    }
  }
}

// Offscreen render target for intermediate multi-pass output. Resized
// lazily (only when canvas dimensions actually change), not every frame.
interface OffscreenTarget {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

function createOffscreenTarget(gl: WebGL2RenderingContext): OffscreenTarget {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create offscreen texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('Failed to create framebuffer')

  return { framebuffer, texture, width: 0, height: 0 }
}

function resizeOffscreenTarget(
  gl: WebGL2RenderingContext,
  target: OffscreenTarget,
  width: number,
  height: number,
) {
  if (target.width === width && target.height === height) return
  gl.bindTexture(gl.TEXTURE_2D, target.texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0)
  target.width = width
  target.height = height
}

export interface Renderer {
  render: (options?: {
    shader: ShaderModule
    values: Record<string, UniformValue>
    transform?: RenderTransform
  }) => void
  setImage: (source: TexImageSource) => void
  readPixels: () => ImageData
}

export function createRenderer(canvas: HTMLCanvasElement, shaderModules: ShaderModule[]): Renderer {
  const gl = canvas.getContext('webgl2')
  if (!gl) throw new Error('WebGL2 is not supported in this browser')

  const placeholderProgram = createProgram(gl, VERTEX_SOURCE, PLACEHOLDER_FRAGMENT_SOURCE)
  const compiled = new Map(shaderModules.map((module) => [module.id, compileShaderModule(gl, module)]))

  const vao = gl.createVertexArray()
  const texture = gl.createTexture()

  // Ping-pong pair for multi-pass shaders — created lazily on first use
  // rather than unconditionally, since most shaders never need them.
  let pingPong: [OffscreenTarget, OffscreenTarget] | null = null

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
    gl.bindVertexArray(vao)

    if (!hasImage || !options) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      // SPEC.md §2.2 — canvas renders at true export dimensions, always.
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(placeholderProgram)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      return
    }

    const shaderProgram = compiled.get(options.shader.id)
    if (!shaderProgram) throw new Error(`Unknown shader id: ${options.shader.id}`)
    const transform = options.transform ?? IDENTITY_TRANSFORM
    const passCount = shaderProgram.passes.length

    if (passCount > 1 && !pingPong) {
      pingPong = [createOffscreenTarget(gl), createOffscreenTarget(gl)]
    }
    if (pingPong) {
      resizeOffscreenTarget(gl, pingPong[0], canvas.width, canvas.height)
      resizeOffscreenTarget(gl, pingPong[1], canvas.width, canvas.height)
    }

    let prevPassTexture: WebGLTexture | null = null
    let writeIndex = 0

    for (let i = 0; i < passCount; i++) {
      const pass = shaderProgram.passes[i]
      const isLastPass = i === passCount - 1

      // SPEC.md §2.2 — canvas renders at true export dimensions, always;
      // that applies to every intermediate pass too, not just the final
      // one — there's no separate preview-resolution render path anywhere
      // in the pipeline.
      gl.bindFramebuffer(gl.FRAMEBUFFER, isLastPass || !pingPong ? null : pingPong[writeIndex].framebuffer)
      gl.viewport(0, 0, canvas.width, canvas.height)

      gl.useProgram(pass.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.uniform1i(pass.uImage, 0)
      gl.uniform2f(pass.uRatio, transform.ratioX, transform.ratioY)
      gl.uniform2f(pass.uPan, transform.panX, transform.panY)
      gl.uniform1f(pass.uCanvasAspect, canvas.width / canvas.height)

      if (shaderProgram.atlasTexture) {
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_2D, shaderProgram.atlasTexture)
        gl.uniform1i(pass.uAtlas, 1)
        gl.uniform1f(pass.uAtlasCols, shaderProgram.atlasCols)
        gl.uniform1f(pass.uAtlasRows, shaderProgram.atlasRows)
      }

      if (prevPassTexture) {
        gl.activeTexture(gl.TEXTURE2)
        gl.bindTexture(gl.TEXTURE_2D, prevPassTexture)
        gl.uniform1i(pass.uPrevPass, 2)
      }

      for (const def of options.shader.uniformSchema) {
        setParam(gl, pass.paramLocations.get(def.key) ?? null, def, options.values[def.key])
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      if (!isLastPass && pingPong) {
        prevPassTexture = pingPong[writeIndex].texture
        writeIndex = writeIndex === 0 ? 1 : 0
      }
    }
  }

  // Reads directly from the framebuffer we just drew into — call this
  // synchronously right after render(), in the same task, with no `await`
  // in between. Unlike canvas.toBlob(), this isn't relying on the browser
  // to have preserved the drawing buffer across a composite step; there's
  // no composite step involved at all. Multi-pass shaders' last pass
  // always renders to the default framebuffer (canvas), same as
  // single-pass, so this needs no pass-count awareness.
  const readPixels = (): ImageData => {
    const { width, height } = canvas
    const pixels = new Uint8ClampedArray(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // gl.readPixels origin is bottom-left; ImageData origin is top-left.
    const flipped = new Uint8ClampedArray(pixels.length)
    const rowBytes = width * 4
    for (let y = 0; y < height; y++) {
      const srcStart = y * rowBytes
      const dstStart = (height - 1 - y) * rowBytes
      flipped.set(pixels.subarray(srcStart, srcStart + rowBytes), dstStart)
    }

    return new ImageData(flipped, width, height)
  }

  return { render, setImage, readPixels }
}
