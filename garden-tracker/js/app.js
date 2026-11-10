import { db, requestPersistence } from './db.js';
import { readTakenDate, stampPhoto } from './photos.js';
import { buildReport, shareOrDownload } from './report.js';
import {
  dayId, parseDayId, fmtDate, fmtTime, fmtHours, fmtElapsed, sessionHours, dayHours,
  toTimeInput, fromTimeInput, uid, esc, newDay,
} from './util.js';

const $ = (s) => document.querySelector(s);
const ACTIVE_KEY = 'gt-active-day'; // day id holding an open (not clocked out) shift

const state = {
  editingId: dayId(), // which day the Today screen is editing
  day: null,
  selecting: false,
  selected: new Set(),
};
const urls = new Set(); // object URLs to clean up between renders
const blobUrl = (blob) => { const u = URL.createObjectURL(blob); urls.add(u); return u; };
const freeUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); };

// ---------------------------------------------------------------- data
async function loadDay(id) { return (await db.get('days', id)) || newDay(id); }
async function saveDay(day) { day.updatedAt = Date.now(); await db.put('days', day); }
const isEmpty = (d) => !d.sessions.length && !d.notes.trim() && !d.volunteers.length;

// ---------------------------------------------------------------- ui helpers
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}
async function busy(text, fn) {
  $('#busy-text').textContent = text; $('#busy').hidden = false;
  try { return await fn(); } finally { $('#busy').hidden = true; }
}
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false; $('#sheet-backdrop').hidden = false;
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
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

// ================================================================ TODAY
async function renderToday() {
  freeUrls();
  state.day = await loadDay(state.editingId);
  const d = state.day;
  const isToday = d.id === dayId();
  $('#today-date').textContent = fmtDate(new Date());
  $('#editing-banner').hidden = isToday;
  $('#editing-date').textContent = fmtDate(parseDayId(d.id), { weekday: 'short', month: 'short', day: 'numeric' });
  $('#clock-btn').hidden = !isToday && !openShift(d); // clock in only for today, but always allow clocking out
  state.todayAtRender = dayId();
  renderClock();
  if (document.activeElement !== $('#notes')) $('#notes').value = d.notes;
  $('#notes-saved').textContent = '';
  renderVolunteers();
  await renderPhotos();
}

// ---------- clock ----------
function openShift(d) { return d.sessions.find((s) => s.in && !s.out); }

function renderClock() {
  const d = state.day;
  const btn = $('#clock-btn');
  const open = openShift(d);
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
  const open = state.day && openShift(state.day);
  const sub = $('#clock-sub');
  if (open) sub.textContent = `On the clock · ${fmtElapsed(Date.now() - open.in)}`;
  else if (state.day?.sessions.length) sub.textContent = `${fmtHours(dayHours(state.day))} logged today`;
  else sub.textContent = 'Tap when you arrive';
}
setInterval(tick, 1000);

$('#clock-btn').addEventListener('click', async () => {
  const d = state.day;
  const open = openShift(d);
  if (open) {
    open.out = Date.now();
    localStorage.removeItem(ACTIVE_KEY);
    toast(`Clocked out — ${fmtHours(sessionHours(open))} today. Nice work! 🌷`);
  } else {
    d.sessions.push({ in: Date.now(), out: null });
    localStorage.setItem(ACTIVE_KEY, d.id);
    toast('Clocked in. Have a lovely shift! 🌼');
  }
  await saveDay(d);
  renderClock();
});

function shiftEditor(index) {
  const d = state.day;
  const s = index == null ? { in: fromTimeInput(d.id, '09:00'), out: fromTimeInput(d.id, '12:00') } : d.sessions[index];
  const body = openSheet(`
    <h3>${index == null ? 'Add a shift' : 'Edit shift'}</h3>
    <p class="sub">${fmtDate(parseDayId(d.id))}</p>
    <label class="field">Clock in<input type="time" id="sh-in" value="${toTimeInput(s.in)}"></label>
    <label class="field">Clock out<input type="time" id="sh-out" value="${s.out ? toTimeInput(s.out) : ''}"></label>
    <button class="btn big" id="sh-save">Save</button>
    ${index == null ? '' : '<button class="btn big danger" id="sh-del">Delete shift</button>'}
  `);
  body.querySelector('#sh-save').onclick = async () => {
    const inV = body.querySelector('#sh-in').value;
    const outV = body.querySelector('#sh-out').value;
    if (!inV) return toast('Please enter a clock-in time');
    const next = { in: fromTimeInput(d.id, inV), out: outV ? fromTimeInput(d.id, outV) : null };
    if (next.out && next.out < next.in) next.out += 864e5; // shift past midnight
    if (index == null) d.sessions.push(next); else d.sessions[index] = next;
    d.sessions.sort((a, b) => a.in - b.in);
    if (!openShift(d) && localStorage.getItem(ACTIVE_KEY) === d.id) localStorage.removeItem(ACTIVE_KEY);
    await saveDay(d); closeSheet(); renderClock();
  };
  const del = body.querySelector('#sh-del');
  if (del) del.onclick = async () => {
    d.sessions.splice(index, 1);
    if (!openShift(d) && localStorage.getItem(ACTIVE_KEY) === d.id) localStorage.removeItem(ACTIVE_KEY);
    await saveDay(d); closeSheet(); renderClock();
  };
}
$('#shifts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit-shift]');
  if (b) shiftEditor(+b.dataset.editShift);
});
$('#add-shift').addEventListener('click', () => shiftEditor(null));

// ---------- photos ----------
async function renderPhotos() {
  const photos = (await db.photosForDay(state.day.id)).sort((a, b) => a.takenAt - b.takenAt);
  $('#photo-count').textContent = photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : '';
  $('#photo-grid').innerHTML = photos.map((p) => `
    <div class="photo">
      <img src="${blobUrl(p.blob)}" alt="">
      ${p.dateSource === 'file' ? '<span class="warn" title="No camera date found; used the file date">file date</span>' : ''}
      <button class="del" data-del-photo="${p.id}" aria-label="Remove photo">×</button>
    </div>`).join('');
}

$('#photo-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  const prog = $('#photo-progress');
  prog.hidden = false;
  let ok = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    prog.textContent = `Stamping photo ${i + 1} of ${files.length}…`;
    try {
      const { date, source } = await readTakenDate(files[i]);
      const { blob, width, height } = await stampPhoto(files[i], date);
      await db.put('photos', {
        id: uid(), dayId: state.day.id, takenAt: date.getTime(), dateSource: source, blob, width, height,
      });
      ok++;
    } catch (err) {
      console.error(err); failed++;
    }
  }
  prog.hidden = true;
  if (ok) await saveDay(state.day); // make sure the day shows up in Daily Reports
  toast(failed ? `Added ${ok}, ${failed} couldn't be opened` : `Added ${ok} photo${ok > 1 ? 's' : ''} 🌸`);
  renderPhotos();
});

$('#photo-grid').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del-photo]');
  if (!b || !confirm('Remove this photo?')) return;
  await db.del('photos', b.dataset.delPhoto);
  renderPhotos();
});

// ---------- notes (autosave) ----------
let notesTimer;
$('#notes').addEventListener('input', () => {
  $('#notes-saved').textContent = 'Saving…';
  clearTimeout(notesTimer);
  notesTimer = setTimeout(async () => {
    state.day.notes = $('#notes').value;
    await saveDay(state.day);
    $('#notes-saved').textContent = 'Saved ✓';
  }, 500);
});

// ---------- volunteers ----------
async function renderVolunteers() {
  const d = state.day;
  $('#vol-list').innerHTML = d.volunteers.map((v, i) =>
    `<span class="chip">${esc(v)}<button data-rm-vol="${i}" aria-label="Remove">×</button></span>`).join('');

  // suggest names used on other days, most frequent first
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

// ---------- export day ----------
async function flushNotes() {
  if (notesTimer) { clearTimeout(notesTimer); state.day.notes = $('#notes').value; await saveDay(state.day); }
}
$('#export-day').addEventListener('click', async () => {
  await flushNotes();
  await saveDay(state.day);
  const report = await busy('Building your day report…', () => buildReport([state.day], 'day'));
  await shareOrDownload(report);
});

$('#back-to-today').addEventListener('click', () => { state.editingId = dayId(); renderToday(); });

// ================================================================ DAILY REPORTS
async function allDays() {
  const days = await db.all('days');
  const out = [];
  for (const d of days) {
    const photos = await db.photosForDay(d.id);
    if (isEmpty(d) && !photos.length) continue;
    out.push({ day: d, photos: photos.sort((a, b) => a.takenAt - b.takenAt) });
  }
  return out.sort((a, b) => b.day.id.localeCompare(a.day.id));
}

async function renderDays() {
  freeUrls();
  const items = await allDays();
  $('#select-btn').textContent = state.selecting ? 'Cancel' : 'Select';
  $('#select-btn').hidden = !items.length;
  $('#select-hint').hidden = !state.selecting;
  $('#select-bar').hidden = !state.selecting;
  const n = state.selected.size;
  $('#export-week').disabled = !n;
  $('#export-week').textContent = n ? `Export Week (${n} day${n > 1 ? 's' : ''})` : 'Export Week';

  if (!items.length) {
    $('#day-list').innerHTML = `<div class="empty"><div class="big">🌱</div>No daily reports yet.<br>Clock in on the Today tab to start one.</div>`;
    return;
  }
  $('#day-list').innerHTML = items.map(({ day, photos }) => {
    const sel = state.selected.has(day.id);
    const thumb = photos[0] ? `<img class="thumb" src="${blobUrl(photos[0].blob)}" alt="">` : '<div class="thumb">✿</div>';
    const bits = [fmtHours(dayHours(day)), `${photos.length} photo${photos.length === 1 ? '' : 's'}`];
    if (day.volunteers.length) bits.push(`${day.volunteers.length} volunteer${day.volunteers.length === 1 ? '' : 's'}`);
    return `<button class="row ${sel ? 'selected' : ''}" data-day="${day.id}">
      ${thumb}
      <div class="meta"><div class="title">${fmtDate(parseDayId(day.id), { weekday: 'long', month: 'short', day: 'numeric' })}</div>
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
  const d = await loadDay(id);
  const photos = (await db.photosForDay(id)).sort((a, b) => a.takenAt - b.takenAt);
  const body = openSheet(`
    <h3>${fmtDate(parseDayId(id))}</h3>
    <p class="sub">${d.sessions.map((s) => `${fmtTime(s.in)} – ${s.out ? fmtTime(s.out) : 'open'}`).join(', ') || 'No shifts logged'} · ${fmtHours(dayHours(d))}</p>
    ${d.notes.trim() ? `<div class="notes-preview">${esc(d.notes)}</div>` : ''}
    ${d.volunteers.length ? `<p class="sub" style="margin-top:12px"><b>Volunteers:</b> ${d.volunteers.map(esc).join(', ')}</p>` : ''}
    ${photos.length ? `<div class="mini-grid">${photos.map((p) => `<img src="${blobUrl(p.blob)}" alt="">`).join('')}</div>` : ''}
    <div class="btn-row">
      <button class="btn ghost" id="dd-edit">Edit</button>
      <button class="btn export" id="dd-export">Export</button>
    </div>
    <button class="btn big danger" id="dd-del">Delete this day</button>
  `);
  body.querySelector('#dd-edit').onclick = () => { closeSheet(); state.editingId = id; showView('view-today'); };
  body.querySelector('#dd-export').onclick = async () => {
    const report = await busy('Building your day report…', () => buildReport([d], 'day'));
    await shareOrDownload(report);
  };
  body.querySelector('#dd-del').onclick = async () => {
    if (!confirm('Delete this day and all its photos? This cannot be undone.')) return;
    await db.deletePhotosForDay(id);
    await db.del('days', id);
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    closeSheet(); renderDays();
  };
}

$('#export-week').addEventListener('click', async () => {
  const ids = [...state.selected].sort();
  if (!ids.length) return;
  const days = await Promise.all(ids.map(loadDay));
  const report = await busy('Building your week report…', () => buildReport(days, 'week'));
  const week = { id: uid(), dayIds: ids, createdAt: Date.now(), hours: days.reduce((t, d) => t + dayHours(d), 0) };
  await db.put('weeks', week);
  state.selecting = false;
  state.selected.clear();
  await shareOrDownload(report);
  toast('Week report saved under Weekly Reports 🌻');
  renderDays();
});

// ================================================================ WEEKLY REPORTS
async function renderWeeks() {
  const weeks = (await db.all('weeks')).sort((a, b) => b.dayIds[0].localeCompare(a.dayIds[0]));
  if (!weeks.length) {
    $('#week-list').innerHTML = `<div class="empty"><div class="big">🌻</div>No weekly reports yet.<br>Go to Daily Reports, tap <b>Select</b>, pick the week's days, then <b>Export Week</b>.</div>`;
    return;
  }
  $('#week-list').innerHTML = weeks.map((w) => `
    <button class="row" data-week="${w.id}">
      <div class="thumb">❁</div>
      <div class="meta"><div class="title">${weekRange(w)}</div>
      <div class="info">${w.dayIds.length} day${w.dayIds.length > 1 ? 's' : ''} · ${fmtHours(w.hours || 0)}</div></div>
      <span class="info">›</span>
    </button>`).join('');
}
const weekRange = (w) => {
  const a = parseDayId(w.dayIds[0]), b = parseDayId(w.dayIds[w.dayIds.length - 1]);
  return w.dayIds.length === 1 ? fmtDate(a, { month: 'short', day: 'numeric', year: 'numeric' })
    : `${fmtDate(a, { month: 'short', day: 'numeric' })} – ${fmtDate(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

$('#week-list').addEventListener('click', async (e) => {
  const row = e.target.closest('[data-week]');
  if (!row) return;
  const w = await db.get('weeks', row.dataset.week);
  const days = (await Promise.all(w.dayIds.map((id) => db.get('days', id)))).filter(Boolean);
  const body = openSheet(`
    <h3>Week of ${weekRange(w)}</h3>
    <p class="sub">${days.map((d) => fmtDate(parseDayId(d.id), { weekday: 'short', month: 'numeric', day: 'numeric' })).join(' · ')}</p>
    <p class="sub">The report is rebuilt from the latest daily entries, so any edits you made since are included.</p>
    <button class="btn big export" id="wk-export">Open / Share Report</button>
    <button class="btn big danger" id="wk-del">Remove from list</button>
  `);
  body.querySelector('#wk-export').onclick = async () => {
    if (!days.length) return toast('The days in this report were deleted');
    const report = await busy('Building your week report…', () => buildReport(days, 'week'));
    w.hours = days.reduce((t, d) => t + dayHours(d), 0);
    await db.put('weeks', w);
    await shareOrDownload(report);
  };
  body.querySelector('#wk-del').onclick = async () => {
    if (!confirm('Remove this weekly report? (The daily reports are kept.)')) return;
    await db.del('weeks', w.id);
    closeSheet(); renderWeeks();
  };
});

// ================================================================ boot
async function boot() {
  requestPersistence();
  // If she clocked in on a previous day and never clocked out, open that day so she can fix it.
  const active = localStorage.getItem(ACTIVE_KEY);
  if (active && active !== dayId()) {
    state.editingId = active;
    setTimeout(() => toast("You're still clocked in from an earlier day — tap ✎ to set the clock-out time."), 2200);
  }
  await renderToday();
  const minSplash = 1900;
  setTimeout(() => $('#splash').classList.add('done'), Math.max(0, minSplash - performance.now()));
}
// Coming back to the app the next morning: roll the Today screen over to the new date
// (unless she was deliberately editing an older day or is still clocked in).
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !state.day) return;
  const wasOnToday = state.editingId === state.todayAtRender;
  if (wasOnToday && dayId() !== state.todayAtRender && !openShift(state.day)) {
    state.editingId = dayId();
    renderToday();
  }
});
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
