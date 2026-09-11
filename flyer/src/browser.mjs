import { chromium } from 'playwright';
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const launch = () => chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--font-render-hinting=none', '--force-color-profile=srgb'],
});
