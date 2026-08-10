export interface CanvasSize {
  id: string
  label: string
  width: number
  height: number
}

// SPEC.md §3.1
export const CANVAS_SIZES: CanvasSize[] = [
  { id: 'link-og', label: 'Link / OG', width: 1200, height: 627 },
  { id: 'square', label: 'Square', width: 1080, height: 1080 },
  { id: 'landscape-hd', label: 'Landscape HD', width: 1920, height: 1080 },
  { id: 'portrait', label: 'Portrait', width: 1080, height: 1350 },
  { id: 'story', label: 'Story', width: 1080, height: 1920 },
]
