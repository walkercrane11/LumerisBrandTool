# CLAUDE.md

Browser-based brand tool: shader-treated image layer + generated vector overlay → flat PNG/AVIF export.

## Source of truth

**`SPEC.md` at the repo root is authoritative.** Read it before implementing anything. Reference it by section number (e.g. §4.1) rather than restating requirements.

- Do not edit `SPEC.md` without asking. If implementation reveals the spec is wrong, say so and propose the change — don't silently diverge.
- Open questions live in §9. If a task depends on one, stop and ask rather than picking a default.
- Non-goals are in §8. Don't build them.

## Stack

- Vite + React + TypeScript
- Raw WebGL2 for rendering — **no three.js**. Every shader is a fullscreen quad with uniforms; a scene graph adds nothing and complicates the multi-pass path Riso needs.
- `@jsquash/avif` (WASM) for AVIF encoding, lazy-loaded on first export
- Deploy: Cloudflare Pages behind Cloudflare Access

**Do not add dependencies without asking.** This is a small, long-lived tool handed to a non-technical team; every dependency is a maintenance obligation on the studio.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # eslint + tsc --noEmit
npm run reference  # regenerate /reference/ exports (see below)
```

## Conventions that change decisions

**Spatial parameters are `cellsAcross`, never pixels.** All spatial values — halftone pitch, ASCII cell size, pixelation block size, dither matrix scale, vector spacing, scribble base scale — are stored as cells across the canvas width and converted to pixels at render time. See §3.3. This is what lets one preset survive a canvas-size change. Pixel values in stored state are a bug.

**The canvas renders at true export dimensions, always.** Never render at a preview size and scale up for export. Display scaling is CSS only. See §2.2.

**Shaders are data modules.** Conform to the contract in §4.1. UI is generated from `uniformSchema`. Adding a shader must require zero UI code changes — if a shader needs a bespoke control, that's a signal the contract needs extending, not that this shader is special.

**Preset state excludes the image.** A preset is a look applied to whatever is loaded. See §5.

## Workflow

- One GitHub issue per unit of work. Issues carry their acceptance criteria from SPEC §7.
- Branch per issue: `phase2/halftone-shader`
- Run `npm run reference` before opening a PR. The regenerated images in `/reference/` are the visual diff — for this project they matter more than unit tests, because correctness here is a matter of appearance.
- If a reference export changes unexpectedly, that's a regression. Investigate before committing.

## Reference exports

`/reference/` holds one fixed source image and one export per shader at a locked preset. `npm run reference` regenerates all of them. They are committed so GitHub renders image diffs in PRs.

Do not update reference images to "make the diff clean." A changed reference is either an intended visual change (say so in the PR) or a bug.

## Notes

- Detailed shader conventions live in `.claude/rules/shaders.md`, scoped to `src/shaders/**`.
- Riso is multi-pass and is the only shader that is. Build it after the single-pass six are working; don't retrofit multi-pass into a load-bearing single-pass core.
