import { noneVector } from './none'
import { dotVector } from './dot'
import { squareVector } from './square'
import { scribblesVector } from './scribbles'
import type { VectorModule } from './types'

// Adding a vector style here should require no other UI code — mirrors
// SPEC.md §4.1's shader contract.
export const VECTOR_MODULES: VectorModule[] = [noneVector, dotVector, squareVector, scribblesVector]

export * from './types'
export * from './combinations'
