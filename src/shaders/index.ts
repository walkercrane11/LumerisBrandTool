import { noneShader } from './none'
import { pixelatedShader } from './pixelated'
import { ditherShader } from './dither'
import { halftoneShader } from './halftone'
import { asciiShader } from './ascii'
import { patternFillShader } from './patternFill'
import type { ShaderModule } from './types'

// Adding a shader here should require no other UI code — SPEC.md §4.1.
export const SHADER_MODULES: ShaderModule[] = [
  noneShader,
  pixelatedShader,
  ditherShader,
  halftoneShader,
  asciiShader,
  patternFillShader,
]

export * from './types'
