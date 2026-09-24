// Capture and encode the Colvard Common Ground scene.
//
//   node scripts/render.mjs --preview                 9x16 stills at t = 1.0, 7.5, 11.5, 14.5 s
//   node scripts/render.mjs --format 9x16             full Reel (450 frames) plus cover still
//   node scripts/render.mjs --format 4x5              feed video
//   node scripts/render.mjs --still og --t 11.5       link-preview still
//
// Options: --workers N (parallel pages, default 1), --resume (keep existing frames),
// --times a,b,c (preview stills at other times).
// Environment overrides: CHROME_PATH (browser binary), FFMPEG_PATH, FFPROBE_PATH,
// RENDER_GL=swiftshader|d3d11|default (defaults to d3d11 on Windows, swiftshader elsewhere).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist', 'index.html');
const FRAMES = path.join(ROOT, 'frames');
const OUTPUT = path.join(ROOT, 'output');
const LOGS = path.join(ROOT, 'logs');

const FORMATS = {
  '9x16': { w: 1080, h: 1920, video: 'Reel_9x16', cover: 'Cover_9x16' },
  '4x5': { w: 1080, h: 1350, video: 'Feed_4x5' },
  og: { w: 1200, h: 630, still: 'LinkPreview_1200x630' },
};
const FPS = 30;
const DURATION = 15;
const FRAME_COUNT = FPS * DURATION;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const RUN = stamp();
fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(OUTPUT, { recursive: true });
fs.mkdirSync(FRAMES, { recursive: true });
const logFile = path.join(LOGS, `render_${RUN}.log`);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

function fail(msg) {
  log(`ERROR: ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
}

function parseArgs(argv) {
  const out = { preview: false, format: null, still: null, t: null, times: null, workers: 1, resume: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') out.preview = true;
    else if (a === '--format') out.format = argv[++i];
    else if (a === '--still') out.still = argv[++i];
    else if (a === '--t') out.t = Number(argv[++i]);
    else if (a === '--workers') out.workers = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--resume') out.resume = true;
    else if (a === '--times') out.times = argv[++i].split(',').map(Number);
    else fail(`Unknown argument: ${a}`);
  }
  if (!out.preview && !out.format && !out.still) fail('Nothing to do. Use --preview, --format <9x16|4x5>, or --still og --t <seconds>.');
  if (out.format && !FORMATS[out.format]?.video) fail(`Unsupported video format: ${out.format}`);
  if (out.still && !FORMATS[out.still]) fail(`Unsupported still format: ${out.still}`);
  return out;
}

async function binaryPath(envName, pkg) {
  if (process.env[envName]) return process.env[envName];
  const mod = await import(pkg);
  const p = mod.default?.path || mod.default;
  if (!p || !fs.existsSync(p)) fail(`${pkg} binary not found. Run npm install, or set ${envName}.`);
  return p;
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${path.basename(bin)} exited ${code}\n${stderr.slice(-2000)}`))));
  });
}

function glMode() {
  if (process.env.RENDER_GL) return process.env.RENDER_GL;
  return process.platform === 'win32' ? 'd3d11' : 'swiftshader';
}

async function launch(headless) {
  const mode = glMode();
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
  if (mode === 'd3d11') args.push('--use-angle=d3d11');
  if (mode === 'swiftshader') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (process.platform === 'linux') args.push('--no-sandbox');
  const opts = { headless, args, protocolTimeout: 600000 };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  log(`Launching browser: headless=${headless}, gl=${mode}${opts.executablePath ? `, executable=${opts.executablePath}` : ''}`);
  return puppeteer.launch(opts);
}

async function openPage(browser, format) {
  const { w, h } = FORMATS[format];
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warn') log(`page ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log(`page error: ${e.message}`));
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const url = `${pathToFileURL(DIST).href}?render=1&format=${format}`;
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__ready !== undefined', { timeout: 60000 });
  await page.evaluate(() => window.__ready);
  return page;
}

async function openWithFallback(format) {
  let browser = await launch(true);
  try {
    const page = await openPage(browser, format);
    return { browser, page };
  } catch (err) {
    log(`Headless start failed: ${err.message}`);
    await browser.close();
    if (process.platform !== 'win32') throw err;
    log('Falling back to a visible browser window, which reliably uses the GPU on Windows.');
    browser = await launch(false);
    const page = await openPage(browser, format);
    return { browser, page };
  }
}

async function checkGl(page) {
  const info = await page.evaluate(() => window.__glInfo);
  log(`WebGL renderer: ${info}`);
  if (/swiftshader/i.test(info || '')) log('WARNING: software rendering (SwiftShader). Frames will render slowly.');
  return info;
}

async function renderTime(page, t, file) {
  await page.evaluate((tt) => window.__renderTime(tt), t);
  await page.screenshot({ path: file, type: 'png', captureBeyondViewport: false });
}

async function stills(format, times, prefix) {
  const { browser, page } = await openWithFallback(format);
  try {
    await checkGl(page);
    const files = [];
    for (const t of times) {
      const file = path.join(OUTPUT, `${prefix}_t${t.toFixed(1).replace('.', '-')}.png`);
      const t0 = Date.now();
      await renderTime(page, t, file);
      log(`Still t=${t.toFixed(2)} s -> ${path.relative(ROOT, file)} (${Date.now() - t0} ms)`);
      files.push(file);
    }
    return files;
  } finally {
    await browser.close();
  }
}

async function video(format, workers, resume) {
  const spec = FORMATS[format];
  if (!resume) {
    for (const f of fs.readdirSync(FRAMES)) if (f.endsWith('.png')) fs.unlinkSync(path.join(FRAMES, f));
  }
  const frameFile = (i) => path.join(FRAMES, `frame_${String(i).padStart(4, '0')}.png`);
  const { browser, page } = await openWithFallback(format);
  const pages = [page];
  try {
    await checkGl(page);
    for (let i = 1; i < workers; i++) pages.push(await openPage(browser, format));
    log(`Rendering ${FRAME_COUNT} frames at ${spec.w}x${spec.h} with ${pages.length} worker page(s)`);
    const started = Date.now();
    let done = 0;
    let next = 0;
    const claim = () => {
      while (next < FRAME_COUNT) {
        const i = next++;
        if (resume && fs.existsSync(frameFile(i))) {
          done++;
          continue;
        }
        return i;
      }
      return -1;
    };
    await Promise.all(
      pages.map(async (p) => {
        for (let i = claim(); i >= 0; i = claim()) {
          await p.evaluate((fi, fps) => window.__renderFrame(fi, fps), i, FPS);
          await p.screenshot({ path: frameFile(i), type: 'png', captureBeyondViewport: false });
          done++;
          if (done % 30 === 0 || done === FRAME_COUNT) {
            const el = (Date.now() - started) / 1000;
            log(`Frames ${done}/${FRAME_COUNT}, elapsed ${el.toFixed(1)} s, ${(el / done).toFixed(2)} s/frame`);
          }
        }
      }),
    );
    if (spec.cover) {
      const cover = path.join(OUTPUT, `Colvard_CommonGround_${spec.cover}_${RUN}.png`);
      await renderTime(page, 14.5, cover);
      log(`Cover still -> ${path.relative(ROOT, cover)}`);
    }
  } finally {
    await browser.close();
  }

  for (let i = 0; i < FRAME_COUNT; i++) if (!fs.existsSync(frameFile(i))) fail(`Missing frame ${i}`);

  const ffmpeg = await binaryPath('FFMPEG_PATH', 'ffmpeg-static');
  const ffprobe = await binaryPath('FFPROBE_PATH', 'ffprobe-static');
  const out = path.join(OUTPUT, `Colvard_CommonGround_${spec.video}_${RUN}.mp4`);
  log(`Encoding with ${ffmpeg}`);
  const t0 = Date.now();
  await run(ffmpeg, [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'frame_%04d.png'),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-r', String(FPS),
    out,
  ]);
  log(`Encoded ${path.relative(ROOT, out)} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const probe = await run(ffprobe, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames:format=duration',
    '-of', 'json',
    out,
  ]);
  const info = JSON.parse(probe.stdout);
  const s = info.streams[0];
  const duration = Number(info.format.duration);
  log(`ffprobe: ${JSON.stringify({ ...s, duration })}`);
  const problems = [];
  if (s.width !== spec.w || s.height !== spec.h) problems.push(`resolution ${s.width}x${s.height}`);
  if (s.codec_name !== 'h264') problems.push(`codec ${s.codec_name}`);
  if (s.pix_fmt !== 'yuv420p') problems.push(`pix_fmt ${s.pix_fmt}`);
  if (s.r_frame_rate !== '30/1') problems.push(`frame rate ${s.r_frame_rate}`);
  if (Math.abs(duration - DURATION) > 0.1) problems.push(`duration ${duration}`);
  if (problems.length) fail(`Verification failed: ${problems.join(', ')}`);
  log('Verification passed: resolution, 30 fps, h264, yuv420p, duration 15.0 s');

  for (const f of fs.readdirSync(FRAMES)) if (f.endsWith('.png')) fs.unlinkSync(path.join(FRAMES, f));
  log('Cleared frames folder');
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  log(`Run ${RUN}: ${process.argv.slice(2).join(' ')}`);
  if (!fs.existsSync(DIST)) fail('dist/index.html not found. Run npm run build first.');
  if (args.preview) {
    await stills('9x16', args.times || [1.0, 7.5, 11.5, 14.5], `Colvard_Preview_9x16_${RUN}`);
  }
  if (args.format) {
    const out = await video(args.format, args.workers, args.resume);
    log(`Done: ${out}`);
  }
  if (args.still) {
    const t = Number.isFinite(args.t) ? args.t : 11.5;
    const [file] = await stills(args.still, [t], `Colvard_CommonGround_${FORMATS[args.still].still || args.still}_${RUN}`);
    log(`Done: ${file}`);
  }
}

main().catch((err) => {
  log(`FAILED: ${err.stack || err.message}`);
  process.exitCode = 1;
});
