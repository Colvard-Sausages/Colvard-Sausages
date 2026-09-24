# Colvard Sausages at Common Ground: 3D Scene Build Brief

Instructions for Claude Code. Read this entire file before starting. Confirm your plan with Frank in a few lines, then build. Stop at the review checkpoint in section 9 before the full render.

## 1. Goal

Build a stylised 3D scene of the Colvard Sausages tent at the 50th Common Ground Country Fair (Unity, Maine, September 25 to 27, 2026) and deliver it, fully automated, as:

1. A 15-second vertical video for Instagram Reels and Facebook Reels. This is the primary deliverable.
2. A 4:5 feed video rendered from the same scene.
3. A self-contained interactive HTML page of the same scene, deployed to a public URL on Cloudflare Pages so it can be linked from Facebook and elsewhere.
4. A cover still for the Reel and a link-preview image for the web page.

Frank must not need to screen-record, encode, or convert anything. Every output lands on his hard drive in the output folder.

Priority: the fair opens Friday, September 25. If time runs short, ship deliverable 1 before anything else.

## 2. Environment and house standards

- Windows 11. Project folder: `C:\Users\frank\Desktop\Python\Colvard_Fair_3D\`. Do not modify or delete anything outside this folder.
- Node.js LTS is required. Check `node -v`; if missing, ask Frank, then install with `winget install OpenJS.NodeJS.LTS`.
- Python is already installed; use it only for the logo picker.
- Prefer npm packages over system installs: `three`, `vite`, `vite-plugin-singlefile`, `puppeteer`, `ffmpeg-static`, `ffprobe-static`, and `wrangler` via npx. Pin versions in `package.json`.
- No emoji anywhere: code, comments, console output, or logs.
- Timestamped output filenames (`YYYYMMDD_HHMM`).
- Detailed, timestamped logs in `logs\` for every script run.
- Input files are chosen through a Windows File Explorer dialog, never typed paths. Preserve exact file paths Frank provides.

## 3. Logo input

Write `scripts\select_logo.py` using tkinter `filedialog.askopenfilename` (filter PNG, JPG, SVG; start directory `C:\Users\frank\Desktop`). Copy the chosen file to `assets\logo.<ext>` and log the original path. If the logo is SVG, the scene rasterises it to a 2048 px wide canvas texture at load.

Placement:
- Front valance of the tent (the fabric strip along the front eave), centred, reading correctly from the camera side.
- A hanging banner on the back wall behind the grill, so the logo reads in the close shot.
- On the end card overlay (section 5).
- Preserve aspect ratio. A white-background logo is acceptable on the white tent; if legibility suffers, place it on a thin cream panel.

## 4. Scene art direction

Mood: early-autumn golden hour at a busy rural Maine fair. Organic, outdoorsy, family-run, warm. Stylised rather than photoreal: painted-diorama realism, clean forms, rich light. Nothing cartoonish, nothing glossy.

Setting:
- Open mown field with trodden dirt paths, gently rolling terrain, hay bales.
- Treeline of maple, birch, and spruce ringing the field, foliage just turning: mostly green with patches of orange, red, and gold.
- 20 to 30 other vendor tents in loose rows (white, cream, forest green, faded barn red canvas). No readable text on any other tent; do not invent other vendors.
- Low sun behind and to the left of the Colvard tent, backlighting the grill smoke. Warm atmospheric haze for depth.

The Colvard tent:
- White 20 x 20 ft frame tent (about 6.1 m square), peaked roof, open front and sides, closed back wall.
- Warm string lights along the front eave, glowing subtly.
- Rustic interior: wooden prep table, wooden crates, a cooler, a chalkboard easel (blank, or "Colvard Sausages" only).

The grill:
- Rustic: a large black barrel grill or an open cast-iron grate over glowing hardwood coals.
- Browned sausage links on the grate; a cast-iron pan of peppers and onions.
- Glowing embers; smoke rising and drifting through the low sunlight. The smoke is the signature element of the close shot. Make it look good.

People at the tent (stylised figures, no likenesses, no detailed faces):
- Grill lead (Carter): tall (6 ft 2 in), fit build, red hair, red and black buffalo-check flannel, working the grill with tongs.
- Two women helping, one older and one younger (his mother and sister): aprons over fleece or flannel. One plates food at the table, one serves customers.
- A queue of 8 to 12 customers at the front of the tent.
- Simple looping motion: arm movement at the grill, handing food across, small weight shifts.

The crowd:
- Several hundred people across the fairground (target 400 in the videos). It must read as a big, busy fair.
- Instanced low-detail figures (`InstancedMesh`), varied heights and builds. Clothing in outdoor tones: olive, rust, navy, cream, heather grey, plaid reds, some brighter knitwear. Some hats, a few children, a few backpacks.
- Walking the paths, standing in groups, browsing tents.

Palette anchors (lighting may shift them; keep the relationships):

| Role | Hex |
|---|---|
| Tent canvas | #F2EEE4 |
| Flannel red | #9B2A22 |
| Maple orange | #C8642B |
| Birch gold | #D9A441 |
| Spruce green | #2E4638 |
| Sky, horizon to overhead | #F4CB8E to #8FB0C4 |

Lighting and rendering:
- ACESFilmic tone mapping, sRGB output, antialiasing on.
- Warm directional sun (#FFBE73) at a low angle with shadows; hemisphere light for sky and ground bounce.
- Exponential fog in a warm haze colour.
- All geometry procedural or from CC0 sources only. No copyrighted models or textures.

## 5. On-screen text

Overlay text is HTML and CSS above the canvas so it stays crisp; it is captured in the video.

Typeface: Zilla Slab Bold for "Colvard Sausages", Zilla Slab Regular for everything else. If the logo has distinctive lettering, match its character instead. Download the woff2 files into `assets\fonts\` and embed them. Nothing loads from the network at runtime.

Sequence (9:16 video):
- 0.4 to 3.4 s, upper third: "This weekend in Unity, Maine"
- 12.8 s to end, centre band: the logo, then
  - "Colvard Sausages"
  - "On the grill at the 50th Common Ground Country Fair"
  - "September 25 to 27"

Sentence case. No all-caps labels, no dot separators. A soft dark gradient behind the end card for legibility, not a box.

Safe zones: keep all text out of the top 14 percent and bottom 20 percent of the 9:16 frame (Instagram interface overlays sit there) and at least 90 px from the side edges.

## 6. Timeline and camera

15.0 s at 30 fps, 450 frames.

- 0.0 to 4.0 s: high, wide establishing shot with a slow descent. Fairground in golden light, crowds, rows of tents, treeline.
- 4.0 to 10.0 s: glide down and forward along a path through the crowd toward the Colvard tent. Logo legible on the valance by 8.0 s.
- 10.0 to 12.5 s: arrive at the tent edge and settle on the grill: sausages, embers, smoke through the sunlight, the family at work.
- 12.5 to 15.0 s: hold with a gentle drift. End card fades in from 12.8 s, fully legible by 13.4 s.

Use a smooth spline camera path with ease-in-out and no sudden acceleration. The 4:5 version follows the same path with framing adjusted so the tent and grill stay centred.

## 7. Technical architecture

Folder layout:

```
Colvard_Fair_3D\
  Colvard_Fair_3D_BRIEF.md
  assets\          logo.*, fonts\
  src\             index.html, main.js, scene\*.js, overlay.css
  scripts\         select_logo.py, render.mjs
  dist\            index.html (single self-contained build)
  frames\          temporary PNGs, cleared after a verified encode
  output\
  logs\
```

Single-file build: Vite with `vite-plugin-singlefile`. Logo, fonts, and all code are inlined into `dist\index.html`. The page must run offline when double-clicked.

Deterministic time (critical):
- Everything that moves (camera, crowd, figures, smoke, embers, text fades) is a pure function of one time value `t` in seconds. No accumulating state, no `Date.now()`, no CSS animations or transitions for timed text.
- All randomness comes from a seeded PRNG (for example mulberry32 with a fixed seed), so the crowd and props are identical in every run and every mode.

Two modes from one build:

Interactive (default):
- Plays the 15 s flyover once, then hands control to OrbitControls centred on the tent (limited polar angle, no going below ground, sensible zoom limits).
- A "Replay the flyover" button restarts it.
- An info panel reads: "Colvard Sausages at the 50th Common Ground Country Fair. Unity, Maine, September 25 to 27. Fairgrounds open 9 a.m. to 6 p.m. Friday and Saturday, 9 a.m. to 5 p.m. Sunday."
- With `prefers-reduced-motion`, skip the flyover and open at the tent view.
- Responsive: taller framing on portrait phones, `devicePixelRatio` capped at 2, crowd reduced to 200 on small screens.

Render (`?render=1&format=9x16`):
- No animation loop. The page exposes:

```js
window.__ready        // Promise: resolves once textures, fonts (document.fonts.ready) and scene are loaded
window.__renderFrame  // (frameIndex, fps) => sets t = frameIndex / fps, updates everything, renders once
window.__glInfo       // unmasked WebGL renderer string, for logging
```

Formats:

| Format | Size | Use |
|---|---|---|
| `9x16` | 1080 x 1920 | Reels video and cover |
| `4x5` | 1080 x 1350 | Feed video |
| `og` | 1200 x 630 | Link-preview still |

## 8. Capture and encode: `scripts\render.mjs`

Commands:
- `node scripts/render.mjs --preview` renders 9x16 stills at t = 1.0, 7.5, 11.5, and 14.5 s.
- `node scripts/render.mjs --format 9x16` renders the full Reel.
- `node scripts/render.mjs --format 4x5` renders the feed video.
- `node scripts/render.mjs --still og --t 11.5` renders the link preview.

Process:
1. Load `dist\index.html` in Puppeteer via a `file:///` URL with the render query parameters.
2. Launch Chrome with the GPU enabled: `headless: true`, args `--use-angle=d3d11`, `--enable-gpu`, `--ignore-gpu-blocklist`. Log `window.__glInfo`. If WebGL fails to initialise, relaunch with `headless: false` (a visible window, which reliably uses the GPU on Windows) and log the fallback. If the renderer string reports SwiftShader, continue but warn that rendering will be slow.
3. Set the viewport to the exact format size at `deviceScaleFactor: 1`. Await `window.__ready`.
4. For each frame, call `__renderFrame(i, 30)`, then screenshot to `frames\frame_0000.png` onward. Log progress every 30 frames with elapsed time.
5. Encode with the `ffmpeg-static` binary:

```
ffmpeg -y -framerate 30 -i frames/frame_%04d.png -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart -r 30 <output.mp4>
```

6. Verify with ffprobe: exact resolution, 30 fps, h264, yuv420p, duration 15.0 s plus or minus 0.1 s. Fail loudly on any mismatch.
7. Clear `frames\` after a verified encode.

No audio track. Frank will add music inside Instagram, which handles licensing.

Outputs in `output\`:
- `Colvard_CommonGround_Reel_9x16_YYYYMMDD_HHMM.mp4`
- `Colvard_CommonGround_Feed_4x5_YYYYMMDD_HHMM.mp4`
- `Colvard_CommonGround_Cover_9x16_YYYYMMDD_HHMM.png` (t = 14.5 s, end card visible)
- `Colvard_CommonGround_LinkPreview_1200x630_YYYYMMDD_HHMM.png`
- `Colvard_CommonGround_Web_YYYYMMDD_HHMM.html` (copy of the single-file build)

## 9. Test ladder and review checkpoint

1. Smoke: `npm install` succeeds; `npm run build` produces `dist\index.html`; the page opens in Chrome with no console errors; `node --check` passes on every script; `python -m py_compile scripts\select_logo.py` passes.
2. Sanity: run `--preview` and inspect the four stills. The logo is legible and not mirrored; the crowd reads as hundreds of people; smoke is visible against the light; text sits inside the safe zones; nothing clips through the tent.
3. Checkpoint: show Frank the four preview stills and wait for his approval or changes before the full render.
4. Functional: the full 9x16 render passes the ffprobe checks; playback is smooth with no flicker or frame jumps.
5. Integration: render 4x5, the cover, and the link preview; open the HTML file offline by double-clicking; after deployment, open the public URL on desktop and on a phone.

## 10. Deploy the web version

Ask Frank before publishing anything.

1. Confirm Frank is ready for the page to be public.
2. Run `npx wrangler login`; Frank completes the browser sign-in to his Cloudflare account.
3. Copy the link-preview PNG into `dist\` as `og.png`, then run `npx wrangler pages deploy dist --project-name colvard-common-ground`.
4. Add Open Graph tags: title "Colvard Sausages at Common Ground"; description "Take a 3D look at our tent at the 50th Common Ground Country Fair in Unity, Maine, September 25 to 27."; `og:image` set to the absolute URL of `og.png` on the deployed domain. Rebuild and redeploy so Facebook shows the preview image.
5. Report the final public URL to Frank and record it in the log.

## 11. Handoff notes for Frank

When everything is done, give Frank these notes along with the output file list:

- Instagram: upload the 9x16 MP4 as a Reel, select the cover PNG, add music in the app.
- Facebook: post the 9x16 or 4x5 MP4, and a separate post with the public link to the interactive scene.
- Suggested caption: "Find us at the 50th Common Ground Country Fair in Unity this weekend, September 25 to 27. Colvard Sausages will be on the grill. Come hungry."
- For the link post, add: "Take a 3D look around our tent: [link]"
