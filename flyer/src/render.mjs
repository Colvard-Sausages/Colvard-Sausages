import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './browser.mjs';
import { box, SIZES } from './base.mjs';
import { DIRECTIONS, DIRECTION_NAMES } from './directions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const ct = JSON.parse(fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8'));
const svg = fs.readFileSync(path.join(ROOT, 'assets/logo/colvard-full-logo.svg'), 'utf8');
const dirUrl = 'file://' + ROOT;

const args = process.argv.slice(2);
const pick = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const dirs = (pick('--dir') || 'A,B,C').split(',');
const sizes = (pick('--size') || 'poster').split(',');
const variants = (pick('--variant') || 'table').split(',');

fs.mkdirSync(OUT, { recursive: true });

const browser = await launch();
for (const d of dirs) {
  for (const size of sizes) {
    for (const variant of variants) {
      const b = box(size);
      const html = DIRECTIONS[d](ct, size, { dir: dirUrl, svg, variant });
      const tmp = path.join(OUT, `.render-${d}-${size}-${variant}.html`);
      fs.writeFileSync(tmp, html);

      const page = await browser.newPage({
        viewport: { width: Math.round(b.pageW), height: Math.round(b.pageH) },
        deviceScaleFactor: SIZES[size].kind === 'screen' ? 2 : 1,
      });
      await page.goto('file://' + tmp, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);

      const tag = variant === 'advance' ? '-advance' : '';
      const stem = `colvard-raffle-${d}-${size}${tag}`;
      if (SIZES[size].kind === 'print') {
        await page.pdf({
          path: path.join(OUT, `${stem}.pdf`),
          width: `${b.pageW / 96}in`, height: `${b.pageH / 96}in`,
          printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
      }
      await page.screenshot({ path: path.join(OUT, `${stem}.png`), fullPage: false });
      await page.close();
      fs.unlinkSync(tmp);
      console.log(`  ${d} (${DIRECTION_NAMES[d]})  ${size}${tag}  ->  ${stem}`);
    }
  }
}
await browser.close();
