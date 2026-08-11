import { CANVAS_SIZES, type CanvasSize } from './canvasSizes'
import { DEFAULT_FIT, type FitState } from './fit'
import { SHADER_MODULES, defaultUniformValues, type ShaderModule, type UniformValue } from './shaders'
import { VECTOR_MODULES, defaultUniformValues as defaultVectorValues, type VectorModule } from './vectors'

// SPEC.md §5.1 — schema version. Bump on any breaking change and add a
// migration; presets/shared links will outlive the code that made them.
export const STATE_SCHEMA_VERSION = 1

// SPEC.md §5.1's note: seed only applies to Dot/Square. Scribbles has no
// stochastic component (vectors/scribbles/index.tsx), so it carries none.
const SEEDED_VECTOR_IDS = new Set(['dot', 'square'])

export interface AppState {
  v: number
  canvas: string // CanvasSize.id — more robust than the "1080x1350" string
  // in SPEC's illustrative example, since id is the actual lookup key the
  // app uses and stays unambiguous even if two sizes ever shared WxH.
  fit: FitState
  shader: { id: string; params: Record<string, UniformValue> }
  vector: { id: string; params: Record<string, UniformValue> }
  seed?: number
}

export interface AppStateInput {
  size: CanvasSize
  fit: FitState
  shader: ShaderModule
  shaderValues: Record<string, UniformValue>
  vector: VectorModule
  vectorValues: Record<string, UniformValue>
  seed: number
}

export function buildState(input: AppStateInput): AppState {
  const state: AppState = {
    v: STATE_SCHEMA_VERSION,
    canvas: input.size.id,
    fit: input.fit,
    shader: { id: input.shader.id, params: input.shaderValues },
    vector: { id: input.vector.id, params: input.vectorValues },
  }
  if (SEEDED_VECTOR_IDS.has(input.vector.id)) {
    state.seed = input.seed
  }
  return state
}

export interface AppStateResolved {
  size: CanvasSize
  fit: FitState
  shader: ShaderModule
  shaderValues: Record<string, UniformValue>
  vector: VectorModule
  vectorValues: Record<string, UniformValue>
  seed: number | null // null — state carried no seed, leave the current one alone
}

// Merges decoded params onto each module's current defaults rather than
// trusting the payload's param set completely — protects a link/preset
// against missing a param a newer build added to a shader/vector since it
// was created.
export function resolveState(state: AppState): AppStateResolved {
  const size = CANVAS_SIZES.find((s) => s.id === state.canvas) ?? CANVAS_SIZES[0]
  const shader = SHADER_MODULES.find((s) => s.id === state.shader.id) ?? SHADER_MODULES[0]
  const vector = VECTOR_MODULES.find((v) => v.id === state.vector.id) ?? VECTOR_MODULES[0]
  return {
    size,
    fit: state.fit ?? DEFAULT_FIT,
    shader,
    shaderValues: { ...defaultUniformValues(shader), ...state.shader.params },
    vector,
    vectorValues: { ...defaultVectorValues(vector), ...state.vector.params },
    seed: state.seed ?? null,
  }
}

async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function toReadableStream(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

// Native CompressionStream/DecompressionStream — no new dependency for
// "deflated" (SPEC.md §5.2), broadly supported in evergreen browsers.
async function compress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return readAllChunks(toReadableStream(bytes).pipeThrough(new CompressionStream('deflate')))
}

async function decompress(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return readAllChunks(toReadableStream(bytes).pipeThrough(new DecompressionStream('deflate')))
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function encodeStateToHash(state: AppState): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(state))
  const compressed = await compress(bytes)
  return bytesToBase64Url(compressed)
}

export async function decodeStateFromHash(hash: string): Promise<AppState> {
  const bytes = base64UrlToBytes(hash)
  const decompressed = await decompress(bytes)
  return JSON.parse(new TextDecoder().decode(decompressed)) as AppState
}
