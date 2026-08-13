import logoSvg from './assets/tom-logo.svg?raw'

// Sidebar header logo (src/assets/tom-logo.svg, supplied by Walker).
// Imported as raw markup (Vite's ?raw, same technique as the Pattern fill
// assets in patternFill.ts) rather than hand-transcribed into JSX — if the
// logo file is swapped later, this needs no changes, just the asset does.
// The source file hardcodes fill="white" (meant for a dark background);
// swapped for currentColor here so it tracks --color-text like every
// other icon in the UI (the panel-section chevron does the same) and
// stays legible in both the light and dark themes instead of only one.
const COLORED_LOGO = logoSvg.replaceAll('fill="white"', 'fill="currentColor"')

export function Logo() {
  return <span className="brand-logo" dangerouslySetInnerHTML={{ __html: COLORED_LOGO }} />
}
