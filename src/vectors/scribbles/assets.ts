import scribble01 from './assets/scribble-01.svg?raw'
import scribble02 from './assets/scribble-02.svg?raw'
import scribble03 from './assets/scribble-03.svg?raw'
import scribble04 from './assets/scribble-04.svg?raw'
import scribble05 from './assets/scribble-05.svg?raw'
import scribble06 from './assets/scribble-06.svg?raw'

export interface ScribbleAsset {
  id: string
  label: string
  // Native viewBox size — assets are varied dimensions (Holden Ellis's
  // source files weren't re-exported to a common artboard), so each
  // asset's own longest dimension gets scaled to a consistent footprint at
  // placement time instead (see square.tsx's coverageGrid.ts for the other
  // "normalize in code, not the source files" precedent in this app).
  width: number
  height: number
  paths: string[]
}

// DOMParser, not regex — the six current assets are all a single <path>,
// but this doesn't assume that stays true for whatever Holden Ellis sends
// next.
function parseScribble(id: string, label: string, raw: string): ScribbleAsset {
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml')
  const svg = doc.documentElement
  const width = Number(svg.getAttribute('width'))
  const height = Number(svg.getAttribute('height'))
  const paths = Array.from(svg.querySelectorAll('path'))
    .map((p) => p.getAttribute('d'))
    .filter((d): d is string => d !== null)
  return { id, label, width, height, paths }
}

const RAW_ASSETS: [string, string, string][] = [
  ['scribble-01', 'Scribble 01', scribble01],
  ['scribble-02', 'Scribble 02', scribble02],
  ['scribble-03', 'Scribble 03', scribble03],
  ['scribble-04', 'Scribble 04', scribble04],
  ['scribble-05', 'Scribble 05', scribble05],
  ['scribble-06', 'Scribble 06', scribble06],
]

export const SCRIBBLE_ASSETS: ScribbleAsset[] = RAW_ASSETS.map(([id, label, raw]) =>
  parseScribble(id, label, raw),
)
