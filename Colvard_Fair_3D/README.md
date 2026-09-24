# Colvard Sausages at Common Ground: 3D scene

Procedural three.js scene of the Colvard tent at the 50th Common Ground Country Fair, rendered to a
15 s vertical Reel. See `Colvard_Fair_3D_BRIEF.md` for the full brief.

## Status

- Reel (9x16) rendered with the Colvard & Co logo (`assets/logo.jpg`). A logo on a plain white
  background is knocked out to ink: dark on the tent fabric, cream on the end card.
- Overlay type is Archivo (wide setting) to match the logo's extended lettering, per the brief's
  typeface rule; Zilla Slab is kept for the chalkboard.
- To swap the logo, run `scripts/select_logo.py`, then rebuild.
- Not done yet: 4x5 feed render, link-preview still, Cloudflare Pages deploy (all supported by the
  scripts, not yet run).

## Windows quick start

```
cd C:\Users\frank\Desktop\Python\Colvard_Fair_3D
npm install
python scripts\select_logo.py
npm run build
node scripts\render.mjs --preview
node scripts\render.mjs --format 9x16
```

Outputs land in `output\`, logs in `logs\`. On Windows the renderer uses the GPU (`--use-angle=d3d11`);
elsewhere it falls back to SwiftShader software rendering, which is slower (about 2 to 3 s per frame).

Useful options for `render.mjs`: `--workers 2` renders with two browser pages in parallel,
`--resume` keeps frames already on disk, `--times 1,8,12` renders preview stills at other times.
Environment overrides: `CHROME_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`, `RENDER_GL`.

## Layout

- `src/main.js`: renderer, interactive and render modes, `window.__ready` / `__renderFrame` / `__glInfo`.
- `src/scene/`: `world.js` (sky, light, terrain, trees), `tents.js`, `grill.js` (coals, smoke, embers),
  `figures.js` (family and queue), `crowd.js` (instanced crowd), `camera.js` (flyover path),
  `overlay.js` (timed text), `logo.js`, `layout.js`, `util.js` (seeded PRNG, noise, easing).
- Everything that moves is a pure function of `t`; all randomness comes from a fixed seed.

Fonts: Archivo and Zilla Slab (SIL Open Font License, see `assets/fonts/`). All geometry is procedural.
