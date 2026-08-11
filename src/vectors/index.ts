import { noneVector } from './none'
import { dotVector } from './dot'
import type { VectorModule } from './types'

// Adding a vector style here should require no other UI code — mirrors
// SPEC.md §4.1's shader contract.
export const VECTOR_MODULES: VectorModule[] = [noneVector, dotVector]

export * from './types'
export * from './combinations'
