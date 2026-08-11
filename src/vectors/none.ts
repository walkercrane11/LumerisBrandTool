import type { VectorModule } from './types'

// "No vector overlay" — always selectable regardless of shader (§4.5: "no
// vector layer at all... is always valid regardless of shader"). Mirrors
// shaders/none.ts's "not a special case" treatment of the empty state.
export const noneVector: VectorModule = {
  id: 'none',
  label: 'None',
  uniformSchema: [],
  render: () => null,
}
