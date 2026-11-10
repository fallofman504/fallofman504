// Reads the "date taken" out of a photo's EXIF metadata and burns a
// date/time stamp into the bottom-left corner.

const MAX_EDGE = 2000; // keep photos sharp but phone storage friendly

/** Returns { date: Date, source: 'exif' | 'file' } */
export async function readTakenDate(file) {
  try {
    const buf = await file.slice(0, 256 * 1024).arrayBuffer();
    const d = parseExifDate(new DataView(buf));
    if (d) return { date: d, source: 'exif' };
  } catch { /* fall through */ }
  return { date: new Date(file.lastModified || Date.now()), source: 'file' };
}

function parseExifDate(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) { // "Exif"
      return parseTiff(view, offset + 10);
    }
    if ((marker & 0xff00) !== 0xff00) return null;
    offset += 2 + size;
  }
  return null;
}

function parseTiff(view, start) {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  const readAscii = (o, len) => {
    let s = '';
    for (let i = 0; i < len && o + i < view.byteLength; i++) {
      const c = view.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const readIfd = (ifdOffset) => {
    const tags = {};
    const base = start + ifdOffset;
    if (base + 2 > view.byteLength) return tags;
    const count = u16(base);
    for (let i = 0; i < count; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > view.byteLength) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const num = u32(e + 4);
      if (type === 2) {
        const valOffset = num > 4 ? start + u32(e + 8) : e + 8;
        tags[tag] = readAscii(valOffset, num);
      } else if (type === 4 || type === 3) {
        tags[tag] = type === 4 ? u32(e + 8) : u16(e + 8);
      }
    }
    return tags;
  };
  const ifd0 = readIfd(u32(start + 4));
  let exif = {};
  if (ifd0[0x8769]) exif = readIfd(ifd0[0x8769]);
  const raw = exif[0x9003] || exif[0x9004] || ifd0[0x0132];
  return raw ? parseExifString(raw) : null;
}

// "2026:11:03 09:42:17" -> local Date
function parseExifString(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d) || +m[1] < 1990 ? null : d;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open this photo')); };
    img.src = url;
  });
}

export function stampText(date) {
  const d = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const t = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${d}  ·  ${t}`;
}

/** Resize + stamp. Returns { blob, width, height } */
export async function stampPhoto(file, date) {
  const img = await loadImage(file); // browsers auto-rotate using EXIF orientation
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const text = stampText(date);
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.042));
  ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  const padX = fontSize * 0.6, padY = fontSize * 0.4;
  const margin = Math.round(fontSize * 0.7);
  const tw = ctx.measureText(text).width;
  const boxW = tw + padX * 2, boxH = fontSize + padY * 2;
  const x = margin, y = h - margin - boxH;

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x, y, boxW, boxH, boxH * 0.3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + boxH / 2 + fontSize * 0.04);

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  return { blob, width: w, height: h };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
