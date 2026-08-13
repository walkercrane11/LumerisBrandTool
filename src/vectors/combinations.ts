// SPEC.md §4.5 — sanctioned shader × vector combinations. `none` (no
// overlay) is always valid for every shader and isn't listed per-entry
// here; allowedVectorIds prepends it unconditionally.
const SANCTIONED_VECTOR_IDS: Record<string, string[]> = {
  none: ['dot', 'square'],
  pixelated: ['scribbles'],
  dither: ['scribbles'],
  halftone: ['scribbles'],
  ascii: ['scribbles'],
  'pattern-fill': ['scribbles'],
  riso: ['dot', 'square'],
}

export function allowedVectorIds(shaderId: string): string[] {
  return ['none', ...(SANCTIONED_VECTOR_IDS[shaderId] ?? [])]
}
