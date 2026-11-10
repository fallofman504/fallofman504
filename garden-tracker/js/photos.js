// Works out when a photo was taken and burns a date/time stamp into the
// bottom-left corner.

const MAX_EDGE = 2000; // keep photos sharp but phone storage friendly

/**
 * Works out when a photo was taken. Returns { date, source, detail }.
 * source:
 *   'taken'    – camera "date taken" metadata (trustworthy)
 *   'camera'   – photo was just taken with the in-app camera button (now)
 *   'modified' – only a "last modified" date was in the file (may be when it was edited/saved)
 *   'file'     – no metadata at all; used the file's date (may be when it was picked/shared)
 */
export async function readTakenDate(file, { fromCamera = false } = {}) {
  let buf;
  try { buf = await file.slice(0, 512 * 1024).arrayBuffer(); } catch { buf = null; }

  let exif = null;
  if (buf) { try { exif = parseExif(new DataView(buf)); } catch { exif = null; } }

  if (exif?.original) return { date: exif.original.date, source: 'taken', detail: `DateTimeOriginal ${exif.original.raw}` };
  if (exif?.digitized) return { date: exif.digitized.date, source: 'taken', detail: `DateTimeDigitized ${exif.digitized.raw}` };

  const xmp = buf ? readXmpDate(buf) : null;
  if (xmp) return { date: xmp.date, source: 'taken', detail: `XMP ${xmp.tag} ${xmp.raw}` };

  if (fromCamera) return { date: new Date(), source: 'camera', detail: 'Taken with the in-app camera' };
  if (exif?.modified) return { date: exif.modified.date, source: 'modified', detail: `DateTime ${exif.modified.raw}` };
  const d = new Date(file.lastModified || Date.now());
  return { date: d, source: 'file', detail: 'No date in photo; used file date' };
}

export const SOURCE_TEXT = {
  taken: "From the photo's camera data (the moment it was taken).",
  camera: 'Taken with the in-app camera, so it uses the current time.',
  modified: "This photo had no \"date taken\", only a \"last modified\" date, which may be when it was edited or saved. Please double-check it.",
  manual: 'Time set by hand.',
  exif: "From the photo's camera data.",
  file: 'This photo had no date inside it, so the file date was used. That may be when it was picked or shared, not when it was taken. Please double-check it.',
};

function parseExif(view) {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) return null;
    if (marker === 0xffda) return null; // start of image data: no more metadata
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 < view.byteLength && view.getUint32(offset + 4) === 0x45786966) { // "Exif"
      return parseTiff(view, offset + 10);
    }
    offset += 2 + size;
  }
  return null;
}

function parseTiff(view, start) {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  const ascii = (o, len) => {
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
      const tag = u16(e), type = u16(e + 2), num = u32(e + 4);
      if (type === 2) tags[tag] = ascii(num > 4 ? start + u32(e + 8) : e + 8, num);
      else if (type === 4) tags[tag] = u32(e + 8);
      else if (type === 3) tags[tag] = u16(e + 8);
    }
    return tags;
  };
  const ifd0 = readIfd(u32(start + 4));
  const sub = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
  const pick = (raw) => { const date = raw && parseExifString(raw); return date ? { date, raw } : null; };
  return { original: pick(sub[0x9003]), digitized: pick(sub[0x9004]), modified: pick(ifd0[0x0132]) };
}

// "2026:11:03 09:42:17" -> local Date (cameras record local time)
function parseExifString(s) {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return isNaN(d) || +m[1] < 1990 ? null : d;
}

function readXmpDate(buf) {
  const text = new TextDecoder('latin1').decode(new Uint8Array(buf));
  for (const tag of ['exif:DateTimeOriginal', 'photoshop:DateCreated', 'xmp:CreateDate']) {
    const re = new RegExp(`${tag}(?:="|>)([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{5,8})`);
    const m = re.exec(text);
    if (m) { const date = parseExifString(m[1]); if (date) return { date, raw: m[1], tag }; }
  }
  return null;
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
const toBlob = (canvas, q) => new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
const toBuffer = async (canvas, q) => (await toBlob(canvas, q)).arrayBuffer();

// Photos are saved as raw bytes (ArrayBuffer), not as Blobs. iPhone Safari can lose access
// to Blobs saved in browser storage, which made thumbnails break and PDF export fail.
export const jpegBlob = (buf) => new Blob([buf], { type: 'image/jpeg' });

/** Read a Blob into an ArrayBuffer (works on older iPhones too). */
export function readBuffer(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(blob);
  });
}

const THUMB_EDGE = 480;
async function thumbFrom(source, w, h) {
  const scale = Math.min(1, THUMB_EDGE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return toBuffer(c, 0.8);
}

export function stampText(date) {
  const d = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const t = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${d}  ·  ${t}`;
}

/**
 * Resize a picked photo and stamp it. All results are ArrayBuffers of JPEG bytes:
 *   jpeg  – the stamped photo used in reports
 *   orig  – a clean (unstamped) copy, so the stamp can be redone if the time needs fixing
 *   thumb – a small copy for the on-screen grid
 */
export async function processPhoto(file, date) {
  const img = await loadImage(file); // browsers auto-rotate using EXIF orientation
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const orig = await toBuffer(canvas, 0.9);
  drawStamp(ctx, w, h, date);
  const jpeg = await toBuffer(canvas, 0.86);
  const thumb = await thumbFrom(canvas, w, h);
  return { jpeg, orig, thumb, width: w, height: h };
}

/** Redo the stamp on the clean copy with a corrected time. Returns { jpeg, thumb }. */
export async function restamp(origBuf, date) {
  const img = await loadImage(jpegBlob(origBuf));
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  drawStamp(ctx, canvas.width, canvas.height, date);
  return { jpeg: await toBuffer(canvas, 0.86), thumb: await thumbFrom(canvas, canvas.width, canvas.height) };
}

/** Make a thumbnail from stored JPEG bytes (used when upgrading older photos). */
export async function makeThumb(jpegBuf) {
  const img = await loadImage(jpegBlob(jpegBuf));
  return thumbFrom(img, img.naturalWidth, img.naturalHeight);
}

function drawStamp(ctx, w, h, date) {
  const text = stampText(date);
  const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.042));
  ctx.font = `600 ${fontSize}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  const padX = fontSize * 0.6, padY = fontSize * 0.4;
  const margin = Math.round(fontSize * 0.7);
  const boxW = ctx.measureText(text).width + padX * 2, boxH = fontSize + padY * 2;
  const x = margin, y = h - margin - boxH;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x, y, boxW, boxH, boxH * 0.3);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + boxH / 2 + fontSize * 0.04);
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
