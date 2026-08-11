# Shader + Vector Brand Tool — Technical Spec

**Status:** Planning · pre-development
**Owner:** Walker / Holden Ellis
**Purpose of this doc:** Architectural context for development in Claude Code. Decisions here have rationale attached; where something is unresolved it is marked **TBD** rather than guessed.

---

## 1. What this is

A browser-based tool that takes an uploaded image, applies a shader treatment to it, overlays a generated vector pattern, and exports a flat composited image at a fixed set of social/ad canvas sizes.

Two layers, one flat output:

| Layer | Content | Rendering |
|---|---|---|
| **Image layer** | Uploaded photo, transformed by one selected shader (or left untreated — see §4.1 `none`) | WebGL fragment shader → canvas |
| **Vector layer** | Generated pattern placed over the image | SVG in DOM (preview) → rasterized into canvas (export) |

**Users:** the client's in-house team. Non-technical. No GLSL exposed, no raw parameter editing outside sanctioned ranges.

**Output:** PNG and AVIF. Flat. No layered or editable export.

---

## 2. Architecture decisions

### 2.1 Fully client-side, statically hosted

No compute backend. Rationale:

- Max canvas is 1920×1080 — realtime WebGL handles this comfortably, so there is no render job to offload.
- AVIF encoding runs in WASM on the client (§6.2), so the one format that might have justified a server does not.
- A studio shipping a tool for a client team should not also be signing up to operate a service. Zero backend means zero ops, zero cost, zero uptime obligation.

**Deploy:** Cloudflare Pages behind Cloudflare Access. Client team authenticates with work email; no user management to build. Versioned canonical URL so the studio can ship updates without redistributing anything.

### 2.2 Canvas renders at true export dimensions, always

The WebGL canvas is sized to the selected export dimensions (e.g. exactly 1080×1350). Display scaling is handled purely by CSS.

Rationale: this makes preview and export the *same render*, not two renders that must be kept in agreement. It eliminates the single most common failure mode in tools of this type — "the export doesn't look like what I saw." There is no offscreen high-res re-render path, because there is no need for one.

Cost: on smaller viewports the canvas is downscaled in CSS, so fine detail (1px dither, small ASCII glyphs) will alias in preview. Mitigate with a 1:1 zoom toggle, not by changing the render size.

### 2.3 Vector layer is real SVG in the DOM

The vector layer renders as an `<svg>` element positioned over the canvas, not drawn into the canvas during preview.

Rationale: crisp preview at any CSS scale, and shape generation logic stays in one place. At export the same SVG is serialized and rasterized into the composite (§6.1) — one source of truth, no second rendering path to drift out of sync.

### 2.4 Preset state excludes the image

A preset is a **look**, applied to whatever image is currently loaded. See §5.

Rationale: this is what campaign consistency actually requires — five different photos, one visual system. It also keeps preset payloads small enough to live in a URL.

---

## 3. Canvas and coordinate model

### 3.1 Supported sizes

| Label | Dimensions | Ratio |
|---|---|---|
| Link / OG | 1200 × 627 | 1.91:1 |
| Square | 1080 × 1080 | 1:1 |
| Landscape HD | 1920 × 1080 | 16:9 |
| Portrait | 1080 × 1350 | 4:5 |
| Story | 1080 × 1920 | 9:16 |

### 3.2 Image fit

Aspect ratios span 1.91:1 to 9:16, so cropping is mandatory, not optional. Required behaviour:

- Cover-fit by default (image fills canvas, overflow cropped)
- User pan and zoom, clamped so the canvas can never contain empty area
- Fit state is part of preserved state (§5) and survives a canvas-size change by re-clamping rather than resetting

### 3.3 Parameter normalization — **important**

**All spatial parameters are defined as "cells across the canvas width," never in pixels.** Pixel values are derived at render time from the active canvas dimensions.

Rationale: presets and multiple canvas sizes have to coexist. A halftone dot stored as `8px` produces a completely different look at 1200×627 than at 1080×1920. A value of `120 cells across` produces the same visual density at every size. Getting this wrong early means every preset breaks the first time someone switches format — and it is expensive to retrofit because it touches every shader's uniform contract.

Applies to: halftone dot pitch, ASCII cell size, pixelation block size, pattern-fill cell size, dither matrix scale, vector dot/square spacing, scribble base scale.

---

## 4. Layer specs

### 4.1 Shader module contract

Each shader is a data module, not a special case:

```ts
interface ShaderModule {
  id: string;
  label: string;
  passes: 1 | 2 | 3;          // Riso needs >1
  fragSource: string | string[]; // one per pass
  uniformSchema: UniformDef[];   // drives UI generation
  atlas?: AtlasDef;              // glyph/shape texture, for cell-based shaders
}

interface UniformDef {
  key: string;
  label: string;
  type: 'float' | 'int' | 'color' | 'bool' | 'enum';
  unit?: 'cellsAcross' | 'degrees' | 'normalized';
  min?: number; max?: number; step?: number;
  options?: string[];             // required when type is 'enum'
  default: number | string | boolean;
}
```

The UI is generated from `uniformSchema`. Adding a seventh shader should require no UI code.

**`options` — added during #4.** The contract as originally written had no way for an `enum`-typed uniform to declare its choices. Needed by later shaders (Halftone's dot shape, ASCII's glyph set, Riso's separation mode); Pixelated's `sampleMode` sidesteps it by using `bool` instead, since it's a binary choice.

**`none` is a shader module, not a special case.** The "no shader treatment" state (raw/untreated image, needed for the Riso-and-vector-only-adjacent Dot/Square combinations in §4.5) is `{ id: 'none', passes: 1, fragSource: <identity passthrough>, uniformSchema: [] }` — selectable in the same list as the other six, generated by the same UI. No branch anywhere in the codebase should special-case "no shader"; it is the seventh entry in the shader list with an empty param set.

**Color policy — decided:** all `color` typed uniforms (shader fg/bg/ink, vector fill) are constrained to a locked brand palette, not a free color picker. Consistent with "no raw parameter editing outside sanctioned ranges" (§1). `uniformSchema` color fields should resolve to a swatch picker over the brand set, not an arbitrary color input. Brand palette values: **TBD** — need swatches from Holden Ellis before Phase 0 comps.

### 4.2 The six shaders are not homogeneous

**Per-pixel (single pass, straightforward):**

- **Pixelated** — block average or nearest sample. Params: cells across, sample mode, optional posterize levels.
- **Dither** — see caveat below. Params: matrix type, levels, palette, contrast, cells across.
- **Halftone** — dot pitch, dot shape (circle / square / line), screen angle, contrast, fg/bg. Optional multi-angle CMYK variant.

**Cell-based (sample a grid region, stamp from an atlas texture):**

- **ASCII** — samples cell luminance, indexes into a glyph atlas. Params: cells across, glyph set, fg/bg, gamma, invert, **contrast** (added after #17's initial build — Walker's feedback: the grid read too loose and the tonal range too flat; contrast stretches the luminance curve so the full glyph ramp, space to `@`, actually gets used). **Decided:** no T/O/M-specific character set — glyph set is standard ASCII characters (e.g. a luminance-ordered ramp like ` .:-=+*#%@`), built fresh rather than ported from prior work.

**Pattern fill — revised twice, not atlas-based.** Originally scoped as "same mechanism [as ASCII], shape atlas instead of glyphs," and #18 was first built that way (a square-size ramp stamped per cell via #17's atlas).

*1st revision:* Walker reviewed `reference/pattern.png` and the actual target is different: discrete tonal bands, each filled with a categorically different procedural pattern (that comp uses checkerboard, dots, diagonal stripes, small squares, and solid, light to dark) — not one shape scaling continuously by size. Doesn't fit the atlas approach (patterns tile at their own frequency, independent of luminance-sampling resolution); confirmed with Walker these can be built procedurally in GLSL, no texture assets needed.

*2nd revision:* two more notes from Walker after seeing the 1st pass. (a) **Strict grid** — band assignment now samples luminance once per cell (mosaic-style, like Halftone/Dither/ASCII), not per-pixel; band edges are blocky/grid-aligned, not following the photo's smooth contours. (b) **Pattern and color both drive the value scale** — each band now has its own bg/fg color pair (10 colors total), not one shared fg/bg, closer to the reference comp's actual richness (~2 colors per tonal region). Two coordinate grids now: the strict `cellsAcross` grid for band assignment, and a finer subdivision (4x) purely for each pattern's own texture, so a band's cell shows several repeats of its pattern rather than at most one shape.

Params: cells across, contrast, rotation angle (a uniform rotation of the whole pattern coordinate space, not true per-cell jitter — randomly rotating a tiling pattern per-cell breaks it into visible seams), invert, and 10 band colors (bg+fg × 5 bands). The specific 5 patterns, their order, and the placeholder color palette are this build's choices, not a spec mandate — treat `reference/pattern.png` as directional, not pixel-prescriptive. Real band colors are still TBD pending the brand palette (§9).

**Multi-pass:**

- **Riso** — the outlier. Riso character comes from channel separation into 2–3 ink layers, per-layer misregistration offset, and overprint (multiply) blending, plus grain. This cannot be a single fragment shader. Params: ink colors (2–3), separation mode, per-layer offset, grain amount, layer opacity.

**Riso — built (#20), grounded in `reference/riso.png`.** Checked the reference first, same as Pattern fill's process — it's not a flat 2-3 color duotone, it's a fine halftone SCREEN per ink channel, each at its own angle (15°/75°/0°, the classic process-printing convention that avoids moiré between overlapping screens), overprinted — much closer to CMY halftone color reproduction than a simple duotone. Reuses the per-layer dot-rendering math from Halftone (rotated grid, circular dot sized by density, capped at 0.5 radius) three times, at different angles/inks/offsets, chained through #19's ping-pong passes: pass 1 lays ink 1 onto a white "paper" base, each subsequent pass reads the accumulated result via `samplePrevPass()` and multiply-blends its own ink on top. `separationMode` has two options: `channels` (each ink driven by one RGB channel's inverse — full-color reconstruction, matches the reference) and `luminance` (all three inks driven by the same luminance value — a monochrome-ish alternative). Added a `cellsAcross` param (screen fineness) not in the original spec list, same reasoning as ASCII's added `contrast` — the actual visual need only became clear once checked against the reference.

**Build order implication:** establish the multi-pass capability in the core *before* Riso, or build the three per-pixel shaders first and treat Riso as a deliberate architecture extension. Do not discover the need for a second pass after the single-pass core is load-bearing.

### 4.3 Dither caveat — decided

Error-diffusion dithering (Floyd–Steinberg, Atkinson) is inherently sequential: each pixel's error propagates to its neighbours. It cannot be expressed as an independent per-pixel fragment shader.

**Decision: ordered dithering only** (Bayer 2×2/4×4/8×8, blue noise) — fully GPU, realtime, no compromise on the tool's responsiveness. No error-diffusion support. Blue-noise ordered dither is visually close enough for brand application, and preserving realtime feedback is worth more to this audience than error-diffusion fidelity.

### 4.4 Vector layer

Three styles:

- **Dot pattern** — generated grid of circles. Params: cells across, radius, color, opacity, blend mode.
- **Square pattern** — same, rectangles. Params add rotation.
- **Scribbles** — premade vector assets placed at varied scale/rotation/position.

**Dot — revised, same process as Pattern fill/Riso: checked `reference/dot-vector.png` before building.** The comp shows dots confined to an irregular region of the canvas, not a uniform full-bleed grid — the originally-listed params can't produce that. Walker's direction: coverage should be a real, tunable param, with control over where the pattern sits. Added: `coverage` (0–1, peak probability a cell gets a dot), `spread` (radius of influence, in cells), `originX`/`originY` (0–1 normalized, center of the coverage falloff). Per-cell inclusion is a seeded hash of (seed, cellX, cellY) — deterministic, so a given seed reproduces the same placement (§5). Same reasoning as ASCII's added `contrast` and Riso's added `cellsAcross`: the actual visual need only became clear once checked against the reference. `jitter` (originally listed) was dropped after Walker reviewed the first build — not wanted.

**Square — same coverage/spread/origin mechanism as Dot, plus mirroring.** `reference/square-vector.png` checked before building: shows true bilateral mirror symmetry (left-right and top-bottom independently, not diagonal/4-fold — confirmed with Walker), not independent per-cell randomness. A cell and its reflection across the origin's row/column share one inclusion decision instead of each rolling separately, so the filled/empty pattern itself is a mirror image, not just its density field. Params: `cellsAcross`, `size` (side length as a fraction of the cell — not `radius`, doesn't fit a square), `rotation` (uniform rotation of each square about its own center — this is the "add rotation" the original prose called for), `coverage`, `spread`, `originX`/`originY`, `color`, `opacity`, `blendMode`. No jitter, same as Dot.

**Scribble asset pipeline** — decided:
- ~10–20 assets, produced by Holden Ellis as art-directed SVGs.
- Bundled inline in the build, versioned with the app. Updating the set requires a redeploy (low-friction on Cloudflare Pages).
- **All scribble assets must be normalized to a common viewBox** before use. Without this, "scale 1.4" means something different for every asset and the parameter becomes meaningless.

Placement randomness is driven by the seed (§5) so a preset reproduces exactly.

### 4.5 Sanctioned shader × vector combinations — decided

Of the 21 pairings (7 shader states including `none`, §4.1 × 3 vector styles), these are permitted. Everything not marked ✅ is not offered in the UI — the shader/vector pickers filter to valid combinations for the current selection rather than allowing all 21 and validating after the fact.

| Shader | Dot | Square | Scribbles |
|---|---|---|---|
| `none` (untreated image) | ✅ | ✅ | ❌ |
| Pixelated | ❌ | ❌ | ❌ |
| Dither | ❌ | ❌ | ✅ |
| Halftone | ❌ | ❌ | ✅ |
| ASCII | ❌ | ❌ | ✅ |
| Pattern fill | ❌ | ❌ | ✅ |
| Riso | ✅ | ✅ | ❌ |

Notes:
- **Pixelated never gets a vector overlay.** It has zero sanctioned combinations — always used alone.
- **Dot and Square are Riso-only** (or over an untreated image). Geometric vector reads clean against Riso's misregistration/grain or against raw photography; it competes with the cell-based/textured shaders.
- **Scribbles pair with the four cell/pattern shaders** (Dither, Halftone, ASCII, Pattern fill) — organic overlay against textured treatments. They do not pair with Riso or `none`.
- No vector layer at all (image + shader only, no overlay) is always valid regardless of shader — this matrix only governs which vector style may be *added* on top of which shader.

---

## 5. State and presets

A seed alone is insufficient — it reproduces stochastic placement but not the continuous parameters (shader choice, intensity, colors, density). The full state object is the unit of persistence; the seed is one field inside it.

### 5.1 Schema

```json
{
  "v": 1,
  "canvas": "1080x1350",
  "fit": { "zoom": 1.24, "x": -0.08, "y": 0.02 },
  "shader": {
    "id": "halftone",
    "params": { "cellsAcross": 120, "angle": 15, "shape": "circle",
                "contrast": 1.2, "fg": "#111111", "bg": "#F4F1EA" }
  },
  "vector": {
    "id": "scribbles",
    "params": { "density": 0.4, "scaleMin": 0.6, "scaleMax": 1.8,
                "opacity": 0.9, "blend": "multiply" },
    "seed": 48211
  }
}
```

`v` is a schema version. Bump it on any breaking change and write a migration — presets will outlive the code that made them.

### 5.2 Two delivery mechanisms, one object

**Named presets.** A versioned JSON file in the repo, art-directed by Holden Ellis, shipped with the build. This is the brand-governance layer and the actual justification for the tool existing rather than the team using Photoshop. Not user-editable.

**Shareable state.** The same object, deflated and base64url-encoded into the URL hash. A designer sends a link; a colleague opens the identical look. No accounts, no database, no persistence layer to maintain or migrate.

Optionally: `localStorage` for "my recent looks" as convenience only, explicitly not a system of record.

---

## 6. Export pipeline

### 6.1 Compositing

1. Canvas already holds the shaded image at true export dimensions.
2. Serialize the vector `<svg>` node → Blob → `Image` → `drawImage` onto the canvas (or an offscreen copy) at 1:1.
3. Composite is complete. No scaling occurs at any point in this pipeline.

The SVG contains only shapes — no external fonts, no `foreignObject` — so the well-known SVG-to-canvas rasterization pitfalls do not apply. Keep it that way; if text is ever added to the vector layer, convert to outlines rather than referencing a font.

### 6.2 File formats

**PNG** — native `canvas.toBlob(cb, 'image/png')`. Universally supported.

**AVIF** — **do not use `canvas.toBlob`.** As of early 2026 only Chrome 124+ supports `image/avif` in `toBlob`; Firefox and Safari silently fall back to PNG while still handing back a file. Silent wrong output is worse than a hard failure.

Use `@jsquash/avif` (WASM libavif, from Squoosh) for all AVIF encoding, on every browser. Rationale: identical bytes regardless of who exports, and no feature-detection branch to maintain or test. Lazy-load the WASM chunk on first export, not at page load. Expect ~1–3s encode for a 1920×1080 frame — show progress.

### 6.3 Filenames

**Decided:** `{preset-or-shader}_{canvas-label}_{shortHash}.{ext}` where `shortHash` is a hash of the state object. Makes exports traceable back to a look.

---

## 7. Phases and acceptance criteria

### Phase 0 — Definition (before any code)

Not skippable, and the phase most likely to get skipped. Shader development without a visual target is an expensive way to wander.

Deliverables:
- ~~5–10 reference comps per shader across varied source images~~ — **done.** `/reference/` holds one approved comp per shader (ascii, dither, halftone, pattern, pixel, riso). These are the locked visual baseline; `npm run reference` regenerates them and they're the PR visual diff (see CLAUDE.md).
- ~~**Sanctioned combinations.**~~ — **done.** See §4.5.
- ~~Dither decision~~ — **done.** See §4.3 (ordered dithering only).
- ~~Scribble asset set: count, source, normalization~~ — **done.** See §4.4 (~10–20 assets, Holden Ellis, bundled inline).
- **Parameter ranges (min/max/default) per shader** — still open, the guardrails that keep output on-brand. Blocks writing real `uniformSchema` entries.
- **Brand palette swatch values** — still open (§4.1, §9). Blocks the color-picker UI and the comps' fg/bg values being final.
- **Input image spec**: expected subject matter, resolution floor, color profile — still open (§9).

**Done when:** the remaining three items above are resolved. Comps and the combination/dither/scribble decisions are already in.

### Phase 1 — Render core — done

Image upload → texture → crop/fit → single per-pixel shader → canvas at true export size → PNG and AVIF export.

**Done when:** one shader works end to end at all five canvas sizes, and a 1080×1920 AVIF export produces a valid AVIF file in Chrome, Firefox and Safari, verified by inspecting the file header — not by trusting the blob type.

*Prove export in Phase 1, not Phase 5. It is the assumption most likely to bite, and everything else is built on top of it.*

**Verified 2026-08-10:** all five canvas sizes, Pixelated shader, PNG + AVIF export. Chrome checked via automated browser testing (dimensions, GL errors, pixel content, AVIF `ftyp`/`avif` header bytes). Firefox and Safari checked by Walker running the same header-inspection script manually — all clear, no failures found in any browser.

### Phase 2 — Shader modules — done

Pixelated, Dither, Halftone against the module contract. Then ASCII (atlas-based) and Pattern fill (revised to procedural tonal bands — see §4.2, not atlas-based after all). Then Riso, with multi-pass.

**Done when:** all six render correctly at all five canvas sizes, UI is generated entirely from `uniformSchema`, and adding a shader requires touching no UI code.

**Verified 2026-08-10 (#21):** all 6 real shaders + `none` (35 combinations) checked in Chrome — GL errors, canvas dimensions, and both PNG/AVIF export (valid file headers, not just blob type) at every combination, no failures. Confirmed via code inspection that `ShaderControls.tsx`, `App.tsx`, and `useCanvasRenderer.ts` contain zero shader-ID-specific branches — five shaders (#15/#16/#17/#18/#20) were added after the contract existed and none of them touched the UI layer. No cross-browser (Firefox/Safari) re-check here, unlike Phase 1's sign-off — that was specifically about `canvas.toBlob('image/avif')`'s browser inconsistency, already resolved and untouched by Phase 2; this phase's "Done when" doesn't call for it, and Phase 2 doesn't touch the export code path at all, only adds shader modules that flow through it.

### Phase 3 — Vector layer

Dot, square, scribbles. SVG DOM overlay, seeded placement, rasterized composite at export.

**Done when:** the same seed reproduces identical placement across reloads, and the exported composite is pixel-identical to the 1:1 preview.

### Phase 4 — State, presets, serialization

State object, URL hash encode/decode, named preset library, reset/randomize.

**Done when:** a URL round-trips a complete look including crop, and a preset applied at one canvas size produces visually equivalent output at another (validates §3.3).

### Phase 5 — Deploy and handoff

Cloudflare Pages + Access, versioned canonical URL, short Loom walkthrough for the client team.

---

## 8. Non-goals

Explicitly out of scope, to prevent scope drift mid-build:

- Layered or editable export (SVG, PSD, Figma)
- User accounts, server-side persistence, shared asset libraries
- Animation or video output
- User-authored shaders or GLSL editing
- Batch processing / multiple images at once
- Arbitrary custom canvas dimensions beyond the five listed

Several of these are reasonable v2 candidates. None should appear in v1.

---

## 9. Open questions

Resolved during Phase 0 planning (2026-08-10):

| Question | Decision |
|---|---|
| Scribble asset set — count, source, who produces it | ~10–20 assets, art-directed SVGs from Holden Ellis. See §4.4. |
| Color handling: locked to brand colors, or freely picked? | Locked to brand palette — no free picker. See §4.1. Actual swatch values still TBD. |
| Any canvas size not on the list (print, email header)? | No — the five sizes in §3.1 cover it. |
| Export filename convention | `{preset-or-shader}_{canvas-label}_{shortHash}.{ext}`. See §6.3. |
| Accessibility/contrast requirements on output | None — exports are flat brand/creative assets, not UI, so WCAG contrast doesn't apply to them. (The tool's own UI should still follow normal accessibility practice, as a separate default.) |
| Does the client want usage analytics? | No — stays consistent with the zero-backend philosophy in §2.1. |

Still open:

- Brand palette swatch values (hex/names) — need from Holden Ellis before Phase 0 comps can be finalized.
- Input image spec: expected subject matter, resolution floor, color profile.
