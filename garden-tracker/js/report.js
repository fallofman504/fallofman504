// Builds the day / week PDF report with a fixed, pretty layout,
// so nobody has to fuss with fonts and picture placement ever again.
import { db } from './db.js';
import { fmtDate, fmtTime, fmtHours, sessionHours, dayHours, parseDayId } from './util.js';

const C = {
  leaf: [61, 122, 82],
  leafDark: [38, 84, 56],
  mint: [232, 244, 234],
  rose: [231, 111, 145],
  sun: [246, 189, 76],
  lilac: [160, 132, 220],
  ink: [44, 52, 47],
  muted: [110, 120, 114],
  line: [214, 226, 216],
};

// jsPDF's built-in fonts only cover Latin characters; drop emoji etc.
const clean = (s) => (s || '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…]/g, '');

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * @param {Array} days  day records (any order)
 * @param {'day'|'week'} kind
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function buildReport(days, kind) {
  const { jsPDF } = window.jspdf;
  days = [...days].sort((a, b) => a.id.localeCompare(b.id));
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 44;
  const CW = W - M * 2;
  let y = 0;

  const first = parseDayId(days[0].id);
  const last = parseDayId(days[days.length - 1].id);
  const range = days.length === 1
    ? fmtDate(first, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : `${fmtDate(first, { month: 'short', day: 'numeric' })} – ${fmtDate(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  // ---------- helpers ----------
  const flower = (cx, cy, r, color) => {
    doc.setFillColor(...color);
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      doc.circle(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.48, 'F');
    }
    doc.setFillColor(...C.sun);
    doc.circle(cx, cy, r * 0.36, 'F');
  };

  const footer = () => {
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.6);
      doc.line(M, H - 34, W - M, H - 34);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.muted);
      doc.text(`Garden Tracker  ·  ${range}`, M, H - 22);
      doc.text(`Page ${i} of ${n}`, W - M, H - 22, { align: 'right' });
    }
  };

  const newPage = () => {
    doc.addPage();
    doc.setFillColor(...C.leaf);
    doc.rect(0, 0, W, 8, 'F');
    y = M;
  };
  const ensure = (h) => { if (y + h > H - 50) newPage(); };

  const section = (title, color, keepWith = 60) => {
    ensure(keepWith); // never leave a heading alone at the bottom of a page
    y += 10;
    doc.setFillColor(...color);
    doc.roundedRect(M, y, 6, 20, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...C.leafDark);
    doc.text(title, M + 14, y + 15);
    y += 32;
  };

  const tableRow = (cols, widths, opts = {}) => {
    const rowH = opts.h || 22;
    ensure(rowH);
    if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(M, y, CW, rowH, 'F'); }
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 10.5);
    doc.setTextColor(...(opts.color || C.ink));
    let x = M + 10;
    cols.forEach((c, i) => {
      const align = opts.align?.[i] || 'left';
      const tx = align === 'right' ? x + widths[i] - 20 : x;
      doc.text(String(c), tx, y + rowH / 2 + 3.5, { align });
      x += widths[i];
    });
    y += rowH;
  };

  // ---------- header ----------
  doc.setFillColor(...C.mint);
  doc.rect(0, 0, W, 118, 'F');
  doc.setFillColor(...C.leaf);
  doc.rect(0, 0, W, 8, 'F');
  flower(W - 70, 52, 22, C.rose);
  flower(W - 118, 82, 15, C.lilac);
  flower(W - 40, 94, 11, C.sun.map((v) => v * 0.95));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...C.leafDark);
  doc.text(kind === 'week' ? 'Weekly Garden Report' : 'Daily Garden Report', M, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...C.muted);
  doc.text(range, M, 82);
  const total = days.reduce((t, d) => t + dayHours(d), 0);
  doc.setFontSize(11);
  doc.text(`${days.length} day${days.length === 1 ? '' : 's'}  ·  ${fmtHours(total)} total`, M, 100);
  y = 140;

  // ---------- time sheet ----------
  section('Time Sheet', C.leaf);
  const tw = [CW * 0.38, CW * 0.2, CW * 0.2, CW * 0.22];
  tableRow(['Date', 'Clock in', 'Clock out', 'Hours'], tw, { bold: true, fill: C.leaf, color: [255, 255, 255], align: [, , , 'right'] });
  let zebra = false;
  for (const d of days) {
    const sessions = d.sessions.length ? d.sessions : [{}];
    sessions.forEach((s, i) => {
      tableRow([
        i === 0 ? fmtDate(parseDayId(d.id), { weekday: 'short', month: 'short', day: 'numeric' }) : '',
        s.in ? fmtTime(s.in) : '—',
        s.out ? fmtTime(s.out) : (s.in ? 'not clocked out' : '—'),
        s.in ? fmtHours(sessionHours(s)) : '—',
      ], tw, { fill: zebra ? [246, 250, 247] : null, align: [, , , 'right'] });
    });
    zebra = !zebra;
  }
  doc.setDrawColor(...C.leaf);
  doc.setLineWidth(1);
  doc.line(M, y, M + CW, y);
  tableRow(['Total', '', '', fmtHours(total)], tw, { bold: true, size: 11.5, color: C.leafDark, align: [, , , 'right'] });
  y += 6;

  // ---------- reflections ----------
  const withNotes = days.filter((d) => clean(d.notes).trim());
  if (withNotes.length) {
    section('Reflection Notes', C.rose);
    for (const d of withNotes) {
      ensure(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...C.rose);
      doc.text(fmtDate(parseDayId(d.id), { weekday: 'long', month: 'long', day: 'numeric' }), M, y);
      y += 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...C.ink);
      const lines = doc.splitTextToSize(clean(d.notes).trim(), CW);
      for (const line of lines) {
        ensure(15);
        doc.text(line, M, y);
        y += 14.5;
      }
      y += 10;
    }
  }

  // ---------- volunteers ----------
  const vols = new Map();
  for (const d of days) {
    for (const name of d.volunteers || []) {
      const key = clean(name).trim();
      if (!key) continue;
      const k = key.toLowerCase();
      if (!vols.has(k)) vols.set(k, { name: key, days: [] });
      vols.get(k).days.push(parseDayId(d.id));
    }
  }
  if (vols.size) {
    section('Volunteers', C.lilac);
    const vw = [CW * 0.4, CW * 0.6];
    tableRow(['Name', kind === 'week' ? 'Days volunteered' : 'Date'], vw, { bold: true, fill: C.lilac, color: [255, 255, 255] });
    let z = false;
    [...vols.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((v) => {
      const daysText = v.days.map((dt) => fmtDate(dt, { weekday: 'short', month: 'numeric', day: 'numeric' })).join(',  ');
      const lines = doc.splitTextToSize(daysText, vw[1] - 20);
      const h = Math.max(22, lines.length * 13 + 9);
      ensure(h);
      if (z) { doc.setFillColor(248, 245, 253); doc.rect(M, y, CW, h, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...C.ink);
      doc.text(v.name, M + 10, y + 14.5);
      doc.setFont('helvetica', 'normal');
      doc.text(lines, M + 10 + vw[0], y + 14.5);
      y += h;
      z = !z;
    });
    y += 6;
  }

  // ---------- photos ----------
  const photos = [];
  for (const d of days) photos.push(...(await db.photosForDay(d.id)));
  photos.sort((a, b) => a.takenAt - b.takenAt);
  if (photos.length) {
    const gap = 14;
    const cellW = (CW - gap) / 2;
    const maxH = 250;
    section('Photos', C.sun, 42 + 20 + maxH);
    let col = 0, rowH = 0, rowY = y, lastDay = null;
    for (const p of photos) {
      const ratio = p.height / p.width;
      let w = cellW, h = cellW * ratio;
      if (h > maxH) { h = maxH; w = h / ratio; }
      if (p.dayId !== lastDay && kind === 'week') {
        if (col !== 0) { y = rowY + rowH + gap; col = 0; rowH = 0; }
        ensure(20 + maxH); // keep the day label with its first photos
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...C.leafDark);
        doc.text(fmtDate(parseDayId(p.dayId), { weekday: 'long', month: 'long', day: 'numeric' }), M, y + 4);
        y += 16;
        rowY = y;
        lastDay = p.dayId;
      }
      if (col === 0) {
        if (y + maxH > H - 50) newPage();
        rowY = y; rowH = 0;
      }
      const x = M + col * (cellW + gap) + (cellW - w) / 2;
      const data = await blobToDataURL(p.blob);
      doc.setFillColor(236, 240, 237);
      doc.roundedRect(x - 3, rowY - 3, w + 6, h + 6, 4, 4, 'F');
      doc.addImage(data, 'JPEG', x, rowY, w, h, undefined, 'FAST');
      rowH = Math.max(rowH, h);
      col++;
      if (col === 2) { col = 0; y = rowY + rowH + gap; }
    }
    if (col !== 0) y = rowY + rowH + gap;
  }

  footer();
  const stamp = days.length === 1 ? days[0].id : `${days[0].id}_to_${days[days.length - 1].id}`;
  return {
    blob: doc.output('blob'),
    filename: `Garden-${kind === 'week' ? 'Week' : 'Day'}-Report_${stamp}.pdf`,
  };
}

/** Share sheet on phones (save to Files, email, Messages...), download elsewhere. */
export async function shareOrDownload({ blob, filename }) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
