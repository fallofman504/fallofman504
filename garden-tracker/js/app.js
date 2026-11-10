import { db, requestPersistence } from './db.js';
import { readTakenDate, processPhoto, restamp, stampText, SOURCE_TEXT } from './photos.js';
import { buildReport, shareOrDownload, byDate } from './report.js';
import {
  dayId, parseDayId, fmtDate, fmtTime, fmtHours, fmtElapsed, sessionHours, dayHours,
  toTimeInput, fromTimeInput, uid, esc, newDay, pad,
} from './util.js';

const $ = (s) => document.querySelector(s);
const DRAFT_KEY = 'gt-draft';   // id of the report being filled in on the Today screen
const NAME_KEY = 'gt-name';
const DEFAULT_NAME = 'Nicky';

const state = {
  mode: 'today',   // 'today' = filling in the current report, 'edit' = fixing a saved one
  day: null,       // the report shown on the Today screen
  selecting: false,
  selected: new Set(),
};
const urls = new Set();
const blobUrl = (blob) => { const u = URL.createObjectURL(blob); urls.add(u); return u; };
const freeUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };

const getName = () => { try { return localStorage.getItem(NAME_KEY) ?? DEFAULT_NAME; } catch { return DEFAULT_NAME; } };
const setName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } };
const getDraftId = () => { try { return localStorage.getItem(DRAFT_KEY); } catch { return null; } };
const setDraftId = (id) => { try { localStorage.setItem(DRAFT_KEY, id); } catch { /* ignore */ } };

// ---------------------------------------------------------------- data
const hasContent = (d, photoCount = 0) => d.sessions.length || d.notes.trim() || d.volunteers.length || photoCount;
const openShift = (d) => d.sessions.find((s) => s.in && !s.out);

async function saveDay(day) {
  day.updatedAt = Date.now();
  if (day.status === 'draft') day.name = getName();
  await db.put('days', day);
}

/** The report the Today screen fills in. Creates a fresh blank one when needed. */
async function loadDraft() {
  const id = getDraftId();
  let d = id && (await db.get('days', id));
  if (d && d.status !== 'draft') d = null;
  if (d && d.date < dayId() && !openShift(d)) {
    const photos = await db.photosForDay(d.id);
    if (hasContent(d, photos.length)) {
      // An earlier day was never exported: file it under Daily Reports and start fresh.
      d.status = 'done';
      await saveDay(d);
      setTimeout(() => toast(`${fmtDate(parseDayId(d.date), { weekday: 'long' })}'s entry was saved to Daily Reports 🌿`), 2300);
    } else {
      d.date = dayId(); // empty draft from an earlier day: just reuse it
      return d;
    }
    d = null;
  }
  if (!d) {
    d = newDay(getName());
    setDraftId(d.id);
  }
  return d;
}

/** Older versions keyed reports by date; give them the new fields. */
async function migrate() {
  for (const d of await db.all('days')) {
    if (!d.date) {
      d.date = d.id; d.status = 'done'; d.createdAt = d.createdAt || d.updatedAt || Date.now();
      await db.put('days', d);
    }
  }
  try { localStorage.removeItem('gt-active-day'); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- ui helpers
function toast(msg, ms = 2800) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function withBusy(title, fn) {
  $('#busy-title').textContent = title;
  $('#busy-text').textContent = '';
  $('#busy').hidden = false;
  await nextFrame();
  try {
    return await fn((text) => { $('#busy-text').textContent = text; });
  } finally {
    $('#busy').hidden = true;
  }
}

function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false; $('#sheet-backdrop').hidden = false;
  $('#sheet').scrollTop = 0;
  return $('#sheet-body');
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; }
$('#sheet-backdrop').addEventListener('click', closeSheet);

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === id));
  window.scrollTo(0, 0);
  if (id === 'view-days') renderDays();
  if (id === 'view-weeks') renderWeeks();
  if (id === 'view-today') renderToday();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', async () => {
  if (state.mode === 'edit') await finishEditing(); // leaving the editor keeps the changes
  showView(t.dataset.view);
}));

/**
 * Build a PDF with a progress spinner, then show a "ready" card. The Share button there is a
 * fresh tap, which iPhones require before they will open the share sheet.
 */
async function exportReport(days, kind, { onDone } = {}) {
  let report;
  try {
    report = await withBusy(kind === 'week' ? 'Building your week report…' : 'Building your day report…',
      (progress) => buildReport(days, kind, { name: getName(), onProgress: progress }));
  } catch (err) {
    console.error(err);
    toast('Sorry, the report could not be built. Please try again.');
    return false;
  }
  if (onDone) await onDone();
  const sizeMb = (report.blob.size / 1048576).toFixed(1);
  const body = openSheet(`
    <div class="ready">
      <div class="ready-icon">${kind === 'week' ? '🌻' : '🌷'}</div>
      <h3>${kind === 'week' ? 'Week' : 'Day'} report is ready!</h3>
      <div class="file">📄 ${esc(report.filename)}</div>
      <p class="sub">${report.pages} page${report.pages > 1 ? 's' : ''} · ${sizeMb} MB</p>
    </div>
    <button class="btn big export" id="rd-share">Share / Save PDF</button>
    <button class="btn big ghost" id="rd-done">Done</button>
    <p class="hint" style="text-align:center">Tip: in the share menu choose <b>Save to Files</b>, Mail or Messages.</p>
  `);
  body.querySelector('#rd-share').onclick = () => shareOrDownload(report);
  body.querySelector('#rd-done').onclick = closeSheet;
  return true;
}

// ================================================================ TODAY
async function renderToday() {
  freeUrls();
  if (state.mode === 'today') state.day = await loadDraft();
  else state.day = (await db.get('days', state.day.id)) || state.day;
  const d = state.day;
  const editing = state.mode === 'edit';

  $('#today-date').textContent = fmtDate(new Date());
  if (document.activeElement !== $('#name-input')) $('#name-input').value = getName();
  $('#editing-banner').hidden = !editing;
  $('#edit-date').value = d.date;
  $('#export-day').hidden = editing;
  $('#edit-actions').hidden = !editing;
  $('#export-day').textContent = 'Export Day Report';
  if (document.activeElement !== $('#notes')) $('#notes').value = d.notes;
  $('#notes-saved').textContent = '';
  renderClock();
  renderVolunteers();
  await renderPhotos();
}

// ---------- name ----------
$('#name-input').addEventListener('input', async (e) => {
  setName(e.target.value.trim());
  if (state.mode === 'today' && state.day && getDraftId() === state.day.id && (await db.get('days', state.day.id))) {
    await saveDay(state.day);
  }
});
$('#name-input').addEventListener('blur', (e) => {
  if (!e.target.value.trim()) { e.target.value = DEFAULT_NAME; setName(DEFAULT_NAME); }
});

// ---------- clock ----------
function renderClock() {
  const d = state.day;
  const btn = $('#clock-btn');
  const open = openShift(d);
  // Clock in only works on today's report; a saved day can still be clocked out of.
  btn.hidden = state.mode === 'edit' && !open;
  btn.classList.toggle('out', !!open);
  btn.classList.toggle('in', !open);
  btn.querySelector('.clock-label').textContent = open ? 'Clock Out' : 'Clock In';
  tick();
  const rows = d.sessions.map((s, i) => `
    <div class="shift">
      <span>${fmtTime(s.in)} – ${s.out ? fmtTime(s.out) : '<i>now</i>'}</span>
      <span><span class="hrs">${s.out ? fmtHours(sessionHours(s)) : ''}</span>
      <button data-edit-shift="${i}" aria-label="Edit shift">✎</button></span>
    </div>`).join('');
  const total = d.sessions.length > 1 ? `<div class="shift-total">Total ${fmtHours(dayHours(d))}</div>` : '';
  $('#shifts').innerHTML = rows + total;
}

function tick() {
  const d = state.day;
  if (!d) return;
  const open = openShift(d);
  const sub = $('#clock-sub');
  if (open) sub.textContent = `On the clock · ${fmtElapsed(Date.now() - open.in)}`;
  else if (d.sessions.length) sub.textContent = `${fmtHours(dayHours(d))} logged`;
  else sub.textContent = 'Tap when you arrive';
}
setInterval(tick, 1000);

$('#clock-btn').addEventListener('click', async () => {
  const d = state.day;
  const open = openShift(d);
  if (open) {
    open.out = Date.now();
    toast(`Clocked out: ${fmtHours(sessionHours(open))}. Nice work! 🌷`);
  } else {
    if (!d.sessions.length) d.date = dayId();
    d.sessions.push({ in: Date.now(), out: null });
    toast('Clocked in. Have a lovely shift! 🌼');
  }
  await saveDay(d);
  renderClock();
});

function shiftEditor(index) {
  const d = state.day;
  const s = index == null ? { in: fromTimeInput(d.date, '09:00'), out: fromTimeInput(d.date, '12:00') } : d.sessions[index];
  const body = openSheet(`
    <h3>${index == null ? 'Add a shift' : 'Edit shift'}</h3>
    <p class="sub">${fmtDate(parseDayId(d.date))}</p>
    <label class="field">Clock in<input type="time" id="sh-in" value="${toTimeInput(s.in)}"></label>
    <label class="field">Clock out<input type="time" id="sh-out" value="${s.out ? toTimeInput(s.out) : ''}"></label>
    <button class="btn big" id="sh-save">Save</button>
    ${index == null ? '' : '<button class="btn big danger" id="sh-del">Delete shift</button>'}
    <button class="btn big ghost" id="sh-cancel">Cancel</button>
  `);
  body.querySelector('#sh-save').onclick = async () => {
    const inV = body.querySelector('#sh-in').value;
    const outV = body.querySelector('#sh-out').value;
    if (!inV) return toast('Please enter a clock-in time');
    const next = { in: fromTimeInput(d.date, inV), out: outV ? fromTimeInput(d.date, outV) : null };
    if (next.out && next.out < next.in) next.out += 864e5; // shift past midnight
    if (index == null) d.sessions.push(next); else d.sessions[index] = next;
    d.sessions.sort((a, b) => a.in - b.in);
    await saveDay(d); closeSheet(); renderClock();
    toast('Shift saved ✓');
  };
  const del = body.querySelector('#sh-del');
  if (del) del.onclick = async () => {
    d.sessions.splice(index, 1);
    await saveDay(d); closeSheet(); renderClock();
  };
  body.querySelector('#sh-cancel').onclick = closeSheet;
}
$('#shifts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit-shift]');
  if (b) shiftEditor(+b.dataset.editShift);
});
$('#add-shift').addEventListener('click', () => shiftEditor(null));

// ---------- photos ----------
const needsCheck = (p) => p.dateSource === 'file' || p.dateSource === 'modified';

async function renderPhotos() {
  const d = state.day;
  const photos = (await db.photosForDay(d.id)).sort((a, b) => a.takenAt - b.takenAt);
  $('#photo-count').textContent = photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : '';
  $('#photo-grid').innerHTML = photos.map((p) => {
    const otherDay = dayId(new Date(p.takenAt)) !== d.date;
    let badge = '';
    if (needsCheck(p)) badge = '<span class="warn">check time</span>';
    else if (otherDay) badge = `<span class="warn">${fmtDate(p.takenAt, { month: 'short', day: 'numeric' })}</span>`;
    return `<div class="photo" data-photo="${p.id}">
      <img src="${blobUrl(p.blob)}" alt="">
      ${badge}
      <button class="del" data-del-photo="${p.id}" aria-label="Remove photo">×</button>
    </div>`;
  }).join('');
}

async function addPhotos(files, fromCamera) {
  if (!files.length) return;
  const d = state.day;
  const prog = $('#photo-progress');
  prog.hidden = false;
  let ok = 0, failed = 0, unsure = 0;
  const otherDays = new Set();
  for (let i = 0; i < files.length; i++) {
    prog.textContent = `Stamping photo ${i + 1} of ${files.length}…`;
    try {
      const { date, source, detail } = await readTakenDate(files[i], { fromCamera });
      const { orig, blob, width, height } = await processPhoto(files[i], date);
      await db.put('photos', {
        id: uid(), dayId: d.id, takenAt: date.getTime(), dateSource: source, dateDetail: detail,
        blob, orig, width, height,
      });
      ok++;
      if (source === 'file' || source === 'modified') unsure++;
      else if (dayId(date) !== d.date) otherDays.add(fmtDate(date, { month: 'short', day: 'numeric' }));
    } catch (err) {
      console.error(err); failed++;
    }
  }
  prog.hidden = true;
  if (ok) await saveDay(d);
  await renderPhotos();
  if (unsure) toast(`${unsure} photo${unsure > 1 ? 's' : ''} had no "date taken". Tap the ones marked "check time" to fix.`, 5000);
  else if (otherDays.size) toast(`Heads up: ${otherDays.size === 1 ? 'some photos were' : 'photos were'} taken on ${[...otherDays].join(', ')}, not this day.`, 5000);
  else if (failed) toast(`Added ${ok}, ${failed} couldn't be opened`);
  else toast(`Added ${ok} photo${ok > 1 ? 's' : ''} 🌸`);
}
$('#photo-input').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; addPhotos(f, false); });
$('#camera-input').addEventListener('change', (e) => { const f = [...e.target.files]; e.target.value = ''; addPhotos(f, true); });

$('#photo-grid').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del-photo]');
  if (del) {
    if (confirm('Remove this photo?')) { await db.del('photos', del.dataset.delPhoto); renderPhotos(); }
    return;
  }
  const tile = e.target.closest('[data-photo]');
  if (tile) photoSheet(tile.dataset.photo);
});

const toLocalInput = (ms) => { const d = new Date(ms); return `${dayId(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

async function photoSheet(id) {
  const p = await db.get('photos', id);
  if (!p) return;
  const warn = needsCheck(p);
  const body = openSheet(`
    <img class="photo-big" src="${blobUrl(p.blob)}" alt="">
    <h3>${esc(stampText(new Date(p.takenAt)))}</h3>
    <div class="src-note ${warn ? 'warn' : ''}">${esc(SOURCE_TEXT[p.dateSource] || 'This photo was added before the time checker existed.')}
      ${p.dateDetail ? `<p class="src-raw">${esc(p.dateDetail)}</p>` : ''}</div>
    ${p.orig ? `
      <label class="field">Fix the date &amp; time<input type="datetime-local" id="ph-when" value="${toLocalInput(p.takenAt)}"></label>
      <button class="btn big" id="ph-save">Update stamp</button>`
    : '<p class="hint">To change this photo\'s time, remove it and add it again.</p>'}
    <button class="btn big danger" id="ph-del">Remove photo</button>
    <button class="btn big ghost" id="ph-close">Close</button>
  `);
  const save = body.querySelector('#ph-save');
  if (save) save.onclick = async () => {
    const v = body.querySelector('#ph-when').value;
    if (!v) return toast('Please pick a date and time');
    const [date, time] = v.split('T');
    const when = new Date(fromTimeInput(date, time.slice(0, 5)));
    save.classList.add('working');
    p.blob = await restamp(p.orig, when);
    p.takenAt = when.getTime();
    p.dateSource = 'manual';
    p.dateDetail = 'Time set by hand';
    await db.put('photos', p);
    closeSheet(); renderPhotos();
    toast('Stamp updated ✓');
  };
  body.querySelector('#ph-del').onclick = async () => {
    if (!confirm('Remove this photo?')) return;
    await db.del('photos', p.id); closeSheet(); renderPhotos();
  };
  body.querySelector('#ph-close').onclick = closeSheet;
}

// ---------- notes (autosave) ----------
let notesTimer = null;
$('#notes').addEventListener('input', () => {
  $('#notes-saved').textContent = 'Saving…';
  clearTimeout(notesTimer);
  notesTimer = setTimeout(flushNotes, 500);
});
async function flushNotes() {
  if (notesTimer == null) return;
  clearTimeout(notesTimer); notesTimer = null;
  state.day.notes = $('#notes').value;
  await saveDay(state.day);
  $('#notes-saved').textContent = 'Saved ✓';
}

// ---------- volunteers ----------
async function renderVolunteers() {
  const d = state.day;
  $('#vol-list').innerHTML = d.volunteers.map((v, i) =>
    `<span class="chip">${esc(v)}<button data-rm-vol="${i}" aria-label="Remove">×</button></span>`).join('');
  const counts = new Map();
  (await db.all('days')).forEach((day) => day.volunteers.forEach((v) => {
    const k = v.toLowerCase(); counts.set(k, { name: v, n: (counts.get(k)?.n || 0) + 1 });
  }));
  const have = new Set(d.volunteers.map((v) => v.toLowerCase()));
  const sugg = [...counts.values()].filter((c) => !have.has(c.name.toLowerCase())).sort((a, b) => b.n - a.n).slice(0, 12);
  $('#vol-suggest-wrap').hidden = !sugg.length;
  $('#vol-suggest').innerHTML = sugg.map((s) => `<button class="chip" data-add-vol="${esc(s.name)}">+ ${esc(s.name)}</button>`).join('');
}
async function addVolunteer(name) {
  name = name.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (state.day.volunteers.some((v) => v.toLowerCase() === name.toLowerCase())) return toast(`${name} is already listed`);
  state.day.volunteers.push(name);
  await saveDay(state.day);
  renderVolunteers();
}
$('#vol-form').addEventListener('submit', (e) => {
  e.preventDefault();
  addVolunteer($('#vol-input').value);
  $('#vol-input').value = '';
});
$('#vol-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-rm-vol]');
  if (!b) return;
  state.day.volunteers.splice(+b.dataset.rmVol, 1);
  await saveDay(state.day);
  renderVolunteers();
});
$('#vol-suggest').addEventListener('click', (e) => {
  const b = e.target.closest('[data-add-vol]');
  if (b) addVolunteer(b.dataset.addVol);
});

// ---------- export day (then start a fresh, blank form) ----------
$('#export-day').addEventListener('click', async () => {
  const btn = $('#export-day');
  if (btn.classList.contains('working')) return;
  await flushNotes();
  const d = state.day;
  const photos = await db.photosForDay(d.id);
  if (!hasContent(d, photos.length)) return toast('Nothing to export yet. Clock in or add photos first 🌱');
  const open = openShift(d);
  if (open) {
    if (!confirm("You're still clocked in. Clock out now and export?")) return;
    open.out = Date.now();
  }
  btn.classList.add('working'); btn.textContent = 'Exporting…';
  try {
    await saveDay(d);
    await exportReport([d], 'day', {
      onDone: async () => {
        // File it under Daily Reports and clear the form for next time.
        d.status = 'done'; d.exportedAt = Date.now();
        await saveDay(d);
        const fresh = newDay(getName());
        setDraftId(fresh.id);
        await renderToday();
        window.scrollTo(0, 0);
        toast('Saved to Daily Reports ✓  The form is ready for next time.', 3500);
      },
    });
  } finally {
    btn.classList.remove('working'); btn.textContent = 'Export Day Report';
  }
});

// ---------- editing a saved day ----------
function startEditing(day) {
  state.mode = 'edit';
  state.day = day;
  showView('view-today');
}
async function finishEditing() {
  if (state.mode !== 'edit') return;
  await flushNotes();
  await saveDay(state.day);
  state.mode = 'today';
  toast('Changes saved ✓');
}
$('#done-edit').addEventListener('click', async () => { await finishEditing(); showView('view-days'); });
$('#done-edit-top').addEventListener('click', async () => { await finishEditing(); showView('view-days'); });
$('#edit-date').addEventListener('change', async (e) => {
  if (!e.target.value) return;
  state.day.date = e.target.value;
  await saveDay(state.day);
  toast(`Moved to ${fmtDate(parseDayId(state.day.date))}`);
  renderPhotos();
});
$('#edit-export').addEventListener('click', async () => {
  await flushNotes();
  await saveDay(state.day);
  exportReport([state.day], 'day');
});

// ================================================================ DAILY REPORTS
async function savedDays() {
  const days = (await db.all('days')).filter((d) => d.status !== 'draft');
  const out = [];
  for (const d of days) {
    const photos = (await db.photosForDay(d.id)).sort((a, b) => a.takenAt - b.takenAt);
    if (!hasContent(d, photos.length)) continue;
    out.push({ day: d, photos });
  }
  return out.sort((a, b) => byDate(b.day, a.day));
}

async function renderDays() {
  freeUrls();
  const items = await savedDays();
  $('#select-btn').textContent = state.selecting ? 'Cancel' : 'Select';
  $('#select-btn').hidden = !items.length;
  $('#select-hint').hidden = !state.selecting;
  $('#select-bar').hidden = !state.selecting;
  const n = state.selected.size;
  $('#export-week').disabled = !n;
  $('#export-week').textContent = n ? `Export Week (${n} day${n > 1 ? 's' : ''})` : 'Export Week';

  if (!items.length) {
    $('#day-list').innerHTML = `<div class="empty"><div class="big">🌱</div>No daily reports yet.<br>Fill in the Today tab and tap <b>Export Day Report</b>.</div>`;
    return;
  }
  $('#day-list').innerHTML = items.map(({ day, photos }) => {
    const sel = state.selected.has(day.id);
    const thumb = photos[0] ? `<img class="thumb" src="${blobUrl(photos[0].blob)}" alt="">` : '<div class="thumb">✿</div>';
    const bits = [fmtHours(dayHours(day)), `${photos.length} photo${photos.length === 1 ? '' : 's'}`];
    if (day.volunteers.length) bits.push(`${day.volunteers.length} volunteer${day.volunteers.length === 1 ? '' : 's'}`);
    return `<button class="row ${sel ? 'selected' : ''}" data-day="${day.id}">
      ${thumb}
      <div class="meta"><div class="title">${fmtDate(parseDayId(day.date), { weekday: 'long', month: 'short', day: 'numeric' })}</div>
      <div class="info">${bits.join(' · ')}</div></div>
      ${state.selecting ? `<span class="check">${sel ? '✓' : ''}</span>` : '<span class="info">›</span>'}
    </button>`;
  }).join('');
}

$('#select-btn').addEventListener('click', () => {
  state.selecting = !state.selecting;
  state.selected.clear();
  renderDays();
});

$('#day-list').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-day]');
  if (!row) return;
  const id = row.dataset.day;
  if (state.selecting) {
    state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
    renderDays();
  } else {
    dayDetail(id);
  }
});

async function dayDetail(id) {
  const d = await db.get('days', id);
  if (!d) return;
  const photos = (await db.photosForDay(id)).sort((a, b) => a.takenAt - b.takenAt);
  const body = openSheet(`
    <h3>${fmtDate(parseDayId(d.date))}</h3>
    <p class="sub">${d.sessions.map((s) => `${fmtTime(s.in)} – ${s.out ? fmtTime(s.out) : 'open'}`).join(', ') || 'No shifts logged'} · ${fmtHours(dayHours(d))}</p>
    ${d.notes.trim() ? `<div class="notes-preview">${esc(d.notes)}</div>` : ''}
    ${d.volunteers.length ? `<p class="sub" style="margin-top:12px"><b>Volunteers:</b> ${d.volunteers.map(esc).join(', ')}</p>` : ''}
    ${photos.length ? `<div class="mini-grid">${photos.map((p) => `<img src="${blobUrl(p.blob)}" alt="">`).join('')}</div>` : ''}
    <div class="btn-row">
      <button class="btn ghost" id="dd-edit">✎ Edit</button>
      <button class="btn export" id="dd-export">Export</button>
    </div>
    <button class="btn big danger" id="dd-del">Delete this day</button>
    <button class="btn big ghost" id="dd-close">Close</button>
  `);
  body.querySelector('#dd-edit').onclick = () => { closeSheet(); startEditing(d); };
  body.querySelector('#dd-export').onclick = () => { closeSheet(); exportReport([d], 'day'); };
  body.querySelector('#dd-del').onclick = async () => {
    if (!confirm('Delete this day and all its photos? This cannot be undone.')) return;
    await db.deletePhotosForDay(id);
    await db.del('days', id);
    closeSheet(); renderDays();
  };
  body.querySelector('#dd-close').onclick = closeSheet;
}

$('#export-week').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  const days = (await Promise.all(ids.map((id) => db.get('days', id)))).filter(Boolean).sort(byDate);
  await exportReport(days, 'week', {
    onDone: async () => {
      await db.put('weeks', { id: uid(), dayIds: days.map((d) => d.id), createdAt: Date.now(), hours: days.reduce((t, d) => t + dayHours(d), 0) });
      state.selecting = false;
      state.selected.clear();
      renderDays();
      toast('Week report saved under Weekly Reports 🌻');
    },
  });
});

// ================================================================ WEEKLY REPORTS
const rangeText = (days) => {
  const a = parseDayId(days[0].date), b = parseDayId(days[days.length - 1].date);
  return days[0].date === days[days.length - 1].date ? fmtDate(a, { month: 'short', day: 'numeric', year: 'numeric' })
    : `${fmtDate(a, { month: 'short', day: 'numeric' })} – ${fmtDate(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};
async function weekDays(w) {
  return (await Promise.all(w.dayIds.map((id) => db.get('days', id)))).filter(Boolean).sort(byDate);
}

async function renderWeeks() {
  const weeks = [];
  for (const w of await db.all('weeks')) weeks.push({ w, days: await weekDays(w) });
  const live = weeks.filter((x) => x.days.length).sort((a, b) => byDate(b.days[0], a.days[0]));
  if (!live.length) {
    $('#week-list').innerHTML = `<div class="empty"><div class="big">🌻</div>No weekly reports yet.<br>Go to Daily Reports, tap <b>Select</b>, pick the week's days, then <b>Export Week</b>.</div>`;
    return;
  }
  $('#week-list').innerHTML = live.map(({ w, days }) => `
    <button class="row" data-week="${w.id}">
      <div class="thumb">❁</div>
      <div class="meta"><div class="title">${rangeText(days)}</div>
      <div class="info">${days.length} day${days.length > 1 ? 's' : ''} · ${fmtHours(days.reduce((t, d) => t + dayHours(d), 0))}</div></div>
      <span class="info">›</span>
    </button>`).join('');
}

$('#week-list').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-week]');
  if (!row) return;
  const w = await db.get('weeks', row.dataset.week);
  const days = await weekDays(w);
  const body = openSheet(`
    <h3>Week of ${rangeText(days)}</h3>
    <p class="sub">${days.map((d) => fmtDate(parseDayId(d.date), { weekday: 'short', month: 'numeric', day: 'numeric' })).join(' · ')}</p>
    <p class="sub">The report is rebuilt from the latest daily entries, so any edits you made since are included.</p>
    <button class="btn big export" id="wk-export">Build &amp; Share Report</button>
    <button class="btn big danger" id="wk-del">Remove from list</button>
    <button class="btn big ghost" id="wk-close">Close</button>
  `);
  body.querySelector('#wk-export').onclick = () => { closeSheet(); exportReport(days, 'week'); };
  body.querySelector('#wk-del').onclick = async () => {
    if (!confirm('Remove this weekly report? (The daily reports are kept.)')) return;
    await db.del('weeks', w.id);
    closeSheet(); renderWeeks();
  };
  body.querySelector('#wk-close').onclick = closeSheet;
});

// ================================================================ boot
async function boot() {
  requestPersistence();
  await migrate();
  await renderToday();
  const minSplash = 1900;
  setTimeout(() => $('#splash').classList.add('done'), Math.max(0, minSplash - performance.now()));
}
// Coming back to the app on a new day: file yesterday's entry and show a fresh form.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.mode === 'today' && state.day && state.day.date < dayId()
      && $('#view-today').classList.contains('active')) renderToday();
});
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
