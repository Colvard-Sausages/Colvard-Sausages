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

export async function loadLogo() {
  const entries = Object.entries(found);
  if (entries.length) {
    const [path, url] = entries[0];
    const isSvg = /\.svg$/i.test(path);
    const source = isSvg ? await rasteriseSvg(url) : await loadImage(url);
    const w = source.naturalWidth || source.width;
    const h = source.naturalHeight || source.height;
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
