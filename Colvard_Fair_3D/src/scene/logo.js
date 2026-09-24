// Logo loading. scripts/select_logo.py copies Frank's file to assets/logo.<ext>.
// Until a logo exists, a plain placeholder badge is generated so the scene still builds.
const found = import.meta.glob('../../assets/logo.{png,jpg,jpeg,svg,PNG,JPG,JPEG,SVG}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo failed to load'));
    img.src = url;
  });
}

function placeholderBadge() {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 760;
  const g = c.getContext('2d');
  const r = 90;
  const path = (inset) => {
    const x = inset;
    const y = inset;
    const w = c.width - inset * 2;
    const h = c.height - inset * 2;
    const rr = Math.max(8, r - inset * 0.6);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  };
  path(6);
  g.fillStyle = '#F6F1E6';
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = '#5A2219';
  g.stroke();
  path(40);
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = '#5A2219';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '700 300px "Zilla Slab"';
  g.fillText('Colvard', c.width / 2, 400);
  g.font = '400 170px "Zilla Slab"';
  g.fillText('Sausages', c.width / 2, 610);
  return c;
}

async function rasteriseSvg(url) {
  const img = await loadImage(url);
  const w = 2048;
  const aspect = (img.naturalHeight || img.height || 1) / (img.naturalWidth || img.width || 1);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.max(1, Math.round(w * aspect));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// A logo on a flat white background becomes ink on transparent, in two colours:
// dark ink for the cream tent fabric and cream ink for the dark end card.
function knockOutWhite(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  const lumAt = (x, y) => {
    const i = (y * w + x) * 4;
    return px[i + 3] < 250 ? 0 : (px[i] + px[i + 1] + px[i + 2]) / 765;
  };
  const corners = [lumAt(0, 0), lumAt(w - 1, 0), lumAt(0, h - 1), lumAt(w - 1, h - 1)];
  if (Math.min(...corners) < 0.9) return null;
  const tint = (rgb) => {
    const out = new ImageData(w, h);
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 765;
      const k = Math.min(1, Math.max(0, (0.93 - lum) / 0.55));
      out.data[i] = rgb[0];
      out.data[i + 1] = rgb[1];
      out.data[i + 2] = rgb[2];
      out.data[i + 3] = Math.round(k * k * (3 - 2 * k) * 255);
    }
    const oc = document.createElement('canvas');
    oc.width = w;
    oc.height = h;
    oc.getContext('2d').putImageData(out, 0, 0);
    return oc;
  };
  return { dark: tint([27, 21, 18]), light: tint([255, 247, 234]) };
}

export async function loadLogo() {
  const entries = Object.entries(found);
  if (entries.length) {
    const [path, url] = entries[0];
    const isSvg = /\.svg$/i.test(path);
    const source = isSvg ? await rasteriseSvg(url) : await loadImage(url);
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
    const inks = knockOutWhite(source);
    if (inks) {
      return { source: inks.dark, aspect: w / h, url: inks.light.toDataURL('image/png'), placeholder: false };
    }
    const dataUrl = isSvg ? source.toDataURL('image/png') : url;
    return { source, aspect: w / h, url: dataUrl, placeholder: false };
  }
  const source = placeholderBadge();
  return {
    source,
    aspect: source.width / source.height,
    url: source.toDataURL('image/png'),
    placeholder: true,
  };
}

// Draws the logo centred on a canvas panel of the given size, preserving aspect ratio.
export function logoPanel(logo, width, height, { background = null, pad = 0.08 } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);
  }
  const maxW = width * (1 - pad * 2);
  const maxH = height * (1 - pad * 2);
  let w = maxW;
  let h = w / logo.aspect;
  if (h > maxH) {
    h = maxH;
    w = h * logo.aspect;
  }
  g.drawImage(logo.source, (width - w) / 2, (height - h) / 2, w, h);
  return c;
}
