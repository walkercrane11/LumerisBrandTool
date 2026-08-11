import type { VectorModule } from '../types'
import { SCRIBBLE_ASSETS } from './assets'

// SPEC.md §4.4: "Scribbles — premade vector assets placed at varied
// scale/rotation/position." §5.1's example state schema sketches a
// density-scatter model (density/scaleMin/scaleMax), but there's no
// reference comp for Scribbles to check that against (unlike Dot/Square),
// and Walker's direction diverges from it: not a generated pattern at all
// — one or two deliberately-placed instances, each independently
// controlled (which asset, position, rotation), not seed-driven. So unlike
// Dot/Square there's no randomness or seed involvement here; every
// placement is an explicit user choice.
//
// "Slot 1" is always on; "slot 2" is gated by `enableSecond`, giving the
// "one or two" Walker asked for. Color/opacity/blendMode are shared across
// both slots and override each asset's own baked-in fill (SPEC.md §4.1
// color policy — same as Dot/Square).
const ASSET_IDS = SCRIBBLE_ASSETS.map((a) => a.id)

// Longest edge of a placed scribble, as a fraction of canvas width. Not a
// user-facing param (not asked for) — assets are varied native sizes
// (513x28 down to 165x61), so this is what makes "one asset" and another
// read as comparable sizes rather than wildly different footprints.
const TARGET_FRACTION = 0.25

function scribbleInstance(assetId: string, x: number, y: number, rotationDeg: number, size: { width: number; height: number }, color: string) {
  const asset = SCRIBBLE_ASSETS.find((a) => a.id === assetId) ?? SCRIBBLE_ASSETS[0]
  const longestEdge = Math.max(asset.width, asset.height)
  const scale = (size.width * TARGET_FRACTION) / longestEdge
  const cx = x * size.width
  const cy = y * size.height

  // Order matters — SVG transform lists apply right-to-left to the
  // content: center the asset on its own midpoint first, then scale, then
  // rotate, then move it to its placement point.
  const transform = `translate(${cx} ${cy}) rotate(${rotationDeg}) scale(${scale}) translate(${-asset.width / 2} ${-asset.height / 2})`

  return (
    <g transform={transform}>
      {asset.paths.map((d, i) => (
        <path key={i} d={d} fill={color} />
      ))}
    </g>
  )
}

export const scribblesVector: VectorModule = {
  id: 'scribbles',
  label: 'Scribbles',
  uniformSchema: [
    { key: 'asset1', label: 'Asset 1', type: 'enum', options: ASSET_IDS, default: ASSET_IDS[0] },
    { key: 'x1', label: 'Position X 1', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'y1', label: 'Position Y 1', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'rotation1', label: 'Rotation 1', type: 'float', unit: 'degrees', min: 0, max: 360, step: 1, default: 0 },
    { key: 'enableSecond', label: 'Second asset', type: 'bool', default: false },
    { key: 'asset2', label: 'Asset 2', type: 'enum', options: ASSET_IDS, default: ASSET_IDS[1] },
    { key: 'x2', label: 'Position X 2', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: 'y2', label: 'Position Y 2', type: 'float', unit: 'normalized', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'rotation2', label: 'Rotation 2', type: 'float', unit: 'degrees', min: 0, max: 360, step: 1, default: 0 },
    // One of the assets' own baked-in colors — brand palette still TBD
    // (SPEC.md §9), same placeholder-swatch situation as every other
    // color param in the app.
    { key: 'color', label: 'Color', type: 'color', default: '#2253ED' },
    { key: 'opacity', label: 'Opacity', type: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'blendMode', label: 'Blend mode', type: 'enum', options: ['normal', 'multiply', 'screen', 'overlay'], default: 'normal' },
  ],
  render: ({ size, values }) => {
    const color = String(values.color)
    const opacity = Number(values.opacity)
    const blendMode = String(values.blendMode)
    const enableSecond = Boolean(values.enableSecond)

    return (
      <g opacity={opacity} style={{ mixBlendMode: blendMode as React.CSSProperties['mixBlendMode'] }}>
        {scribbleInstance(String(values.asset1), Number(values.x1), Number(values.y1), Number(values.rotation1), size, color)}
        {enableSecond &&
          scribbleInstance(String(values.asset2), Number(values.x2), Number(values.y2), Number(values.rotation2), size, color)}
      </g>
    )
  },
}
