// UI for the Garden Almanac.
(function () {
  const A = window.Almanac;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Storage (best effort: private browsing can block it) ----------
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem('almanac.' + k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem('almanac.' + k, JSON.stringify(v)); } catch { /* not persisted */ } },
    clear() { try { Object.keys(localStorage).filter(k => k.startsWith('almanac.')).forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ } },
  };

  const state = {
    settings: store.get('settings', null), // { zip, zone, city, state, lastFrost, firstFrost }
    garden: store.get('garden', []),       // saved plantings
    date: A.today(),
    selected: new Set(),
    cat: 'All',
    query: '',
    report: null,
    pendingLoc: null,
  };

  // ---------- Tabs ----------
  function showTab(tab) {
    if (!state.settings && tab === 'plan') tab = 'setup';
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== tab;
    for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab || (tab === 'setup' && b.dataset.tab === 'plan')));
    $('#plantBar').hidden = tab !== 'plan' || state.selected.size === 0;
    if (tab === 'plan') renderPlan();
    if (tab === 'garden') renderGarden();
    if (tab === 'setup') openSetup();
    window.scrollTo(0, 0);
  }
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));

  // ---------- Location setup ----------
  function loadZipData() {
    if (window.ZIPDATA) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'data/zipdata.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('ZIP database failed to load'));
      document.head.appendChild(s);
    });
  }

  function openSetup() {
    const sel = $('#manualZone');
    if (!sel.options.length) sel.innerHTML = A.ZONES.map(z => `<option value="${z}">Zone ${z} (${A.zoneTempRange(z)})</option>`).join('');
    if (state.settings) {
      $('#zipInput').value = state.settings.zip || '';
      showLocResult({ ...state.settings });
    }
    loadZipData().catch(() => {});
  }

  $('#zipForm').addEventListener('submit', async e => {
    e.preventDefault();
    const zip = $('#zipInput').value.trim();
    const err = $('#zipError');
    err.hidden = true;
    if (!/^\d{5}$/.test(zip)) { err.textContent = 'Please enter a 5-digit ZIP code.'; err.hidden = false; return; }
    try { await loadZipData(); } catch { err.textContent = 'Could not load the ZIP database. Try reloading the page.'; err.hidden = false; return; }
    const r = A.lookupZip(zip);
    if (!r) {
      err.textContent = `ZIP ${zip} isn't in the database (it covers the lower 48 states). Pick your zone below instead.`;
      err.hidden = false;
      document.querySelector('details.manual').open = true;
      return;
    }
    showLocResult({ zip, zone: r.zone, city: r.city, state: r.state, lastFrost: null, firstFrost: null });
  });

  $('#manualZoneBtn').addEventListener('click', () => {
    showLocResult({ zip: '', zone: $('#manualZone').value, city: '', state: '', lastFrost: null, firstFrost: null });
  });

  function showLocResult(loc) {
    state.pendingLoc = loc;
    $('#zrZone').textContent = loc.zone;
    $('#zrPlace').textContent = loc.city ? `${titleCase(loc.city)}, ${loc.state}${loc.zip ? ' · ' + loc.zip : ''}` : (loc.zip ? `ZIP ${loc.zip}` : 'Zone chosen manually');
    $('#zrTemp').textContent = `Average coldest winter night: ${A.zoneTempRange(loc.zone)}` + (A.isFrostFree(loc.zone) ? ' · frost is rare here' : '');
    const y = A.today().getFullYear();
    const { lf, ff } = A.frostForYear(loc, y);
    $('#lfInput').value = A.iso(lf);
    $('#ffInput').value = A.iso(ff);
    $('#zipResult').hidden = false;
  }

  $('#saveLoc').addEventListener('click', () => {
    const loc = state.pendingLoc;
    if (!loc) return;
    const md = v => v.slice(5); // 'YYYY-MM-DD' -> 'MM-DD'
    const typical = A.frostForYear({ zone: loc.zone }, A.today().getFullYear());
    const lf = $('#lfInput').value, ff = $('#ffInput').value;
    loc.lastFrost = lf && md(lf) !== md(A.iso(typical.lf)) ? md(lf) : null;
    loc.firstFrost = ff && md(ff) !== md(A.iso(typical.ff)) ? md(ff) : null;
    state.settings = loc;
    store.set('settings', loc);
    renderLocChip();
    showTab('plan');
  });

  function titleCase(s) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

  function renderLocChip() {
    const s = state.settings, chip = $('#locChip');
    if (!s) { chip.hidden = true; return; }
    chip.hidden = false;
    chip.textContent = `Zone ${s.zone}${s.city ? ' · ' + titleCase(s.city) + ', ' + s.state : ''} ✎`;
  }
  $('#locChip').addEventListener('click', () => showTab('setup'));
  $('#changeLoc').addEventListener('click', () => showTab('setup'));

  // ---------- Plant chooser ----------
  $('#dateInput').addEventListener('change', e => {
    if (!e.target.value) return;
    state.date = A.parseIso(e.target.value);
    renderPlan();
  });
  $('#todayBtn').addEventListener('click', () => { state.date = A.today(); renderPlan(); });
  $('#search').addEventListener('input', e => { state.query = e.target.value.trim().toLowerCase(); renderList(); });

  const CATS = ['All', 'Vegetable', 'Herb', 'Fruit', 'Flower'];
  $('#catChips').innerHTML = CATS.map(c => `<button type="button" class="chip" data-cat="${c}">${c === 'All' ? 'All' : c + 's'}</button>`).join('');
  $('#catChips').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    state.cat = b.dataset.cat;
    renderList();
  });

  function renderPlan() {
    if (!state.settings) return;
    const d = state.date, s = state.settings;
    $('#dateInput').value = A.iso(d);
    $('#todayBtn').hidden = A.iso(d) === A.iso(A.today());

    // Season summary relative to this year's frost dates.
    const { lf, ff } = A.frostForYear(s, d.getFullYear());
    let line;
    const toLf = A.diffDays(lf, d), toFf = A.diffDays(ff, d);
    if (A.isFrostFree(s.zone)) line = `Zone ${s.zone} is nearly frost-free. Cool-season crops do best in your winter, warm-season crops the rest of the year.`;
    else if (toLf > 0) line = `<b>${toLf} days</b> until your typical last frost (${A.fmt(lf)}). Time for cool-season crops and indoor seed starting.`;
    else if (toFf >= 0) line = `Frost-free season: <b>${toFf} days</b> until your typical first fall frost (${A.fmt(ff)}).`;
    else {
      const nextLf = A.frostForYear(s, d.getFullYear() + 1).lf;
      line = `Past your first fall frost (${A.fmt(ff)}). Next spring's last frost is around ${A.fmt(nextLf)}.`;
    }
    $('#seasonLine').innerHTML = line;
    // Frost bar: year as a strip with the frost-free season highlighted, and a marker for the date.
    const yStart = A.mk(d.getFullYear(), 0, 1), yLen = A.diffDays(A.mk(d.getFullYear() + 1, 0, 1), yStart);
    const pct = x => (100 * A.diffDays(x, yStart) / yLen).toFixed(2) + '%';
    $('#frostBar').innerHTML = `<span class="season-fill" style="left:${pct(lf)};right:calc(100% - ${pct(ff)})"></span>
      <span class="marker" style="left:${pct(d)}"></span>
      ${A.MONTHS.map((m, i) => `<i style="left:${pct(A.mk(d.getFullYear(), i, 1))}">${m[0]}</i>`).join('')}`;
    renderList();
  }

  function renderList() {
    const d = state.date, s = state.settings;
    for (const c of document.querySelectorAll('#catChips .chip')) c.classList.toggle('on', c.dataset.cat === state.cat);
    const now = [], soon = [], later = [];
    for (const p of PLANTS) {
      if (state.cat !== 'All' && p.cat !== state.cat) continue;
      if (state.query && !p.name.toLowerCase().includes(state.query)) continue;
      const st = A.plantStatus(p, s, d);
      if (st.open.length) now.push({ p, st });
      else if (st.next && A.diffDays(st.next.start, d) <= 30) soon.push({ p, st });
      else later.push({ p, st });
    }
    const byName = (a, b) => a.p.name.localeCompare(b.p.name);
    now.sort(byName); soon.sort((a, b) => a.st.next.start - b.st.next.start || byName(a, b)); later.sort((a, b) => (a.st.next?.start || 0) - (b.st.next?.start || 0) || byName(a, b));

    const row = ({ p, st }, kind) => {
      let what;
      if (kind === 'now') {
        what = st.open.map(w => `<span class="act act-${w.type}">${esc(A.actionLabel(p, w.type))}</span> <span class="muted">until ${A.fmt(w.end)}</span>`).join('<br>');
      } else if (st.next) {
        what = `<span class="act act-${st.next.type}">${esc(A.actionLabel(p, st.next.type))}</span> <span class="muted">from ${A.fmt(st.next.start)}</span>`;
      } else what = '<span class="muted">No window in your zone</span>';
      const tags = [p.hardy === 'hardy' ? 'Frost hardy' : p.hardy === 'half' ? 'Light frost OK' : 'Frost tender'];
      if (p.perennial) tags.push('Perennial');
      if (p.succ) tags.push(`Re-sow every ${p.succ}d`);
      return `<label class="plant-row${state.selected.has(p.id) ? ' checked' : ''}">
        <input type="checkbox" value="${p.id}" ${state.selected.has(p.id) ? 'checked' : ''}>
        <span class="pr-main">
          <span class="pr-name">${esc(p.name)} <span class="cat-dot cat-${p.cat}" title="${p.cat}"></span></span>
          <span class="pr-what">${what}</span>
          <span class="pr-tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</span>
        </span>
      </label>`;
    };
    const group = (title, sub, items, kind, open = true) => items.length ? `
      <details class="group group-${kind}" ${open ? 'open' : ''}>
        <summary><span class="g-title">${title}</span> <span class="g-count">${items.length}</span><span class="g-sub">${sub}</span>
          ${kind === 'now' ? '<button type="button" class="link sel-all" data-kind="now">Select all</button>' : ''}</summary>
        <div class="rows">${items.map(i => row(i, kind)).join('')}</div>
      </details>` : '';

    const dateWord = A.iso(d) === A.iso(A.today()) ? 'today' : 'on ' + A.fmt(d);
    let html = group('Plant now', `In season ${dateWord}`, now, 'now');
    if (!now.length) html += `<div class="card empty">Nothing is in its planting window ${dateWord}${state.query ? ' for that search' : ''}. Check <b>Coming up</b>, or pick a later planting date above to plan ahead. You can still check any plant below and the report will schedule it for its next window.</div>`;
    html += group('Coming up', 'Windows opening in the next 30 days', soon, 'soon');
    html += group('Later', 'Plan ahead: scheduled for the next window', later, 'later', now.length + soon.length < 6);
    if (!now.length && !soon.length && !later.length) html = '<div class="card empty">No plants match your search.</div>';
    $('#plantGroups').innerHTML = html;
    updateBar();
  }

  $('#plantGroups').addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    e.target.checked ? state.selected.add(e.target.value) : state.selected.delete(e.target.value);
    e.target.closest('.plant-row').classList.toggle('checked', e.target.checked);
    updateBar();
  });
  $('#plantGroups').addEventListener('click', e => {
    const b = e.target.closest('.sel-all');
    if (!b) return;
    e.preventDefault();
    const boxes = b.closest('details').querySelectorAll('input[type=checkbox]');
    const allOn = [...boxes].every(x => x.checked);
    boxes.forEach(x => { x.checked = !allOn; x.checked ? state.selected.add(x.value) : state.selected.delete(x.value); x.closest('.plant-row').classList.toggle('checked', x.checked); });
    updateBar();
  });

  function updateBar() {
    const n = state.selected.size;
    $('#plantBar').hidden = n === 0 || $('#plan').hidden;
    $('#selCount').textContent = `${n} plant${n === 1 ? '' : 's'} selected`;
  }
  $('#clearSel').addEventListener('click', () => { state.selected.clear(); renderList(); });
  $('#plantBtn').addEventListener('click', () => buildReport());

  // ---------- Report ----------
  const KIND_ICON = { sow: '🌰', germ: '🌱', fert: '🧪', harden: '🌤️', transplant: '🪴', succ: '🔁', harvest: '🧺', harvestend: '🏁' };

  function buildReport() {
    const ids = [...state.selected].sort((a, b) => PLANTS_BY_ID[a].name.localeCompare(PLANTS_BY_ID[b].name));
    const plans = [], skipped = [];
    for (const id of ids) {
      const pl = A.planPlant(PLANTS_BY_ID[id], state.settings, state.date);
      pl ? plans.push(pl) : skipped.push(PLANTS_BY_ID[id].name);
    }
    state.report = { created: A.iso(A.today()), date: A.iso(state.date), settings: { ...state.settings }, plans, skipped };
    renderReport();
    $('#report').hidden = false;
    document.body.classList.add('noscroll');
    $('#report').scrollTop = 0;
  }

  function renderReport() {
    const r = state.report, s = r.settings;
    const { lf, ff } = A.frostForYear(s, A.parseIso(r.date).getFullYear());
    const comp = A.companionReport(r.plans.map(p => p.plantId));
    const place = s.city ? `${titleCase(s.city)}, ${s.state}` : (s.zip ? `ZIP ${s.zip}` : '');
    const D = x => A.fmt(x, { year: true });

    const plantCard = pl => {
      const p = PLANTS_BY_ID[pl.plantId];
      const fert = pl.tasks.filter(t => t.kind === 'fert');
      const indoor = pl.method === 'indoor' || pl.method === 'fallindoor';
      return `<section class="pcard">
        <header>
          <h3>${esc(p.name)}</h3>
          <span class="act act-${pl.method}">${esc(pl.action)}</span>
        </header>
        ${pl.plannedAhead ? `<p class="ahead">Not in season on ${A.fmt(r.date)}. Scheduled for its next window, which opens ${D(pl.window.start)}.</p>` : ''}
        <dl class="facts">
          <div><dt>${indoor ? 'Start seeds' : p.germ ? 'Sow' : 'Plant'}</dt><dd><b>${D(pl.sow)}</b><span class="muted"> · window ${A.fmt(pl.window.start)} – ${A.fmt(pl.window.end)}</span></dd></div>
          <div><dt>Germination</dt><dd>${p.germ ? `<b>${p.germ[0]}–${p.germ[1]} days</b><span class="muted"> · sprouts ${A.fmt(pl.germ.from)} – ${A.fmt(pl.germ.to)}</span>` : '<span class="muted">Not from seed</span>'}</dd></div>
          <div><dt>Transplant</dt><dd>${pl.transplant ? `<b>${D(pl.transplant)}</b><span class="muted"> · harden off from ${A.fmt(pl.harden)}</span>` : '<span class="muted">Sown in place, no transplant needed</span>'}</dd></div>
          <div><dt>Fertilize</dt><dd>${fert.length ? `<ul class="flist">${fert.map(t => `<li><b>${A.fmt(t.date)}</b> ${esc(t.text)}</li>`).join('')}</ul>` : '<span class="muted">None needed</span>'}</dd></div>
          <div><dt>${p.bloom ? 'Blooms' : 'Harvest'}</dt><dd><b>${D(pl.harvest.from)} – ${D(pl.harvest.to)}</b>${p.years ? '<span class="muted"> · first light harvest</span>' : ''}${pl.frostWarning ? `<div class="warn">⚠️ ${esc(pl.frostWarning)}</div>` : ''}</dd></div>
          ${pl.succession.length ? `<div><dt>Succession</dt><dd>Sow again every ${p.succ} days: ${pl.succession.map(x => `<b>${A.fmt(x)}</b>`).join(', ')}</dd></div>` : ''}
        </dl>
        <p class="pnote">${esc(p.note)}</p>
        <p class="pmeta"><span>☀️ ${esc(p.sun)}</span><span>↔ ${esc(p.space)}</span><span>${esc(p.fam)}</span></p>
        ${p.comp.length || p.avoid.length ? `<p class="pcomp">${p.comp.length ? `<span class="good">Good neighbors:</span> ${p.comp.map(id => esc(PLANTS_BY_ID[id].name)).join(', ')}` : ''}${p.comp.length && p.avoid.length ? '<br>' : ''}${p.avoid.length ? `<span class="bad">Keep apart from:</span> ${p.avoid.map(id => esc(PLANTS_BY_ID[id].name)).join(', ')}` : ''}</p>` : ''}
      </section>`;
    };

    $('#reportSheet').innerHTML = `
      <header class="sheet-head">
        <div>
          <p class="eyebrow">Garden Almanac · Planting report</p>
          <h2 id="reportTitle">${r.plans.length} plant${r.plans.length === 1 ? '' : 's'} for ${A.fmt(r.date, { year: true, weekday: true })}</h2>
          <p class="muted">Zone ${s.zone}${place ? ' · ' + esc(place) : ''} · Last frost ~${A.fmt(lf)} · First frost ~${A.fmt(ff)}</p>
        </div>
      </header>
      ${comp.conflicts.length || comp.friends.length ? `<section class="companions">
        <h3>Companion check</h3>
        ${comp.conflicts.map(([a, b]) => `<p class="bad-pair">⚠️ <b>${esc(a)}</b> and <b>${esc(b)}</b> grow poorly together. Plant them in separate beds.</p>`).join('')}
        ${comp.friends.length ? `<p class="good-pair">🤝 Good pairs in your list: ${comp.friends.map(([a, b]) => `${esc(a)} + ${esc(b)}`).join(' · ')}</p>` : ''}
      </section>` : ''}
      ${r.skipped.length ? `<p class="ahead">Left out: ${r.skipped.map(esc).join(', ')}. The growing season in zone ${s.zone} is too short to reach harvest outdoors.</p>` : ''}
      ${r.plans.map(plantCard).join('')}
      <footer class="sheet-foot">Dates are estimates from typical frost dates for zone ${s.zone}. Watch the weather, and check seed packets for variety-specific days to maturity.</footer>`;
  }

  function closeReport() { $('#report').hidden = true; document.body.classList.remove('noscroll'); }
  $('#closeReport').addEventListener('click', closeReport);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#report').hidden) closeReport(); });

  $('#saveGarden').addEventListener('click', () => {
    const r = state.report;
    for (const pl of r.plans) {
      state.garden.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        created: r.created, plan: pl, done: [],
      });
    }
    store.set('garden', state.garden);
    state.selected.clear();
    closeReport();
    toast(`Saved ${r.plans.length} planting${r.plans.length === 1 ? '' : 's'} to My Garden`);
    showTab('garden');
  });

  // ---------- Exports ----------
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function shareOrDownload(name, blob) {
    const file = new File([blob], name, { type: blob.type });
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(name, blob);
  }
  const stamp = () => A.iso(A.today());

  function icsFor(items) {
    const icsEsc = s => s.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const fold = l => l.length <= 74 ? l : l.match(/.{1,73}/g).join('\r\n ');
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Garden Almanac//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Garden Almanac'];
    let n = 0;
    for (const { name, task } of items) {
      const start = task.date.replace(/-/g, '');
      const end = A.iso(A.addDays(A.parseIso(task.date), 1)).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${start}-${n++}-${Math.random().toString(36).slice(2, 8)}@garden-almanac`, `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
        fold(`SUMMARY:${icsEsc(`${KIND_ICON[task.kind] || ''} ${name}: ${shortKind(task)}`)}`),
        fold(`DESCRIPTION:${icsEsc(task.text)}`), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER;RELATED=START:PT8H', fold(`DESCRIPTION:${icsEsc(name + ': ' + task.text)}`), 'END:VALARM',
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' });
  }
  function shortKind(t) {
    return { sow: 'Plant', germ: 'Check for sprouts', fert: 'Fertilize', harden: 'Start hardening off', transplant: 'Transplant', succ: 'Sow again', harvest: 'Harvest begins', harvestend: 'Harvest ends' }[t.kind] || t.text;
  }

  $('#exportIcs').addEventListener('click', () => {
    const items = state.report.plans.flatMap(pl => pl.tasks.map(task => ({ name: pl.name, task })));
    shareOrDownload(`garden-plan-${stamp()}.ics`, icsFor(items));
  });

  $('#exportCsv').addEventListener('click', () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Plant', 'Method', 'Sow / start', 'Germination (days)', 'Sprouts by', 'Transplant', 'Fertilize', 'Harvest from', 'Harvest to', 'Succession sowings', 'Notes']];
    for (const pl of state.report.plans) {
      const p = PLANTS_BY_ID[pl.plantId];
      rows.push([pl.name, pl.action, pl.sow, p.germ ? `${p.germ[0]}-${p.germ[1]}` : '', pl.germ ? pl.germ.to : '', pl.transplant || '',
        pl.tasks.filter(t => t.kind === 'fert').map(t => `${t.date}: ${t.text}`).join(' | '),
        pl.harvest.from, pl.harvest.to, pl.succession.join(' '), pl.frostWarning || '']);
    }
    rows.push([]);
    rows.push(['All tasks by date']);
    rows.push(['Date', 'Plant', 'Task']);
    const all = state.report.plans.flatMap(pl => pl.tasks.map(t => [t.date, pl.name, t.text])).sort((a, b) => a[0].localeCompare(b[0]));
    rows.push(...all);
    const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
    shareOrDownload(`garden-plan-${stamp()}.csv`, new Blob([csv], { type: 'text/csv' }));
  });

  $('#exportPrint').addEventListener('click', () => window.print());

  function loadHtml2canvas() {
    if (window.html2canvas) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/html2canvas.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  $('#exportPng').addEventListener('click', async () => {
    const btn = $('#exportPng');
    btn.disabled = true;
    try {
      await loadHtml2canvas();
      const sheet = $('#reportSheet');
      const bg = getComputedStyle(sheet).backgroundColor;
      const canvas = await html2canvas(sheet, { backgroundColor: bg, scale: Math.min(2, window.devicePixelRatio || 1) });
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      await shareOrDownload(`garden-plan-${stamp()}.png`, blob);
    } catch {
      toast('Could not create the image. Try a screenshot or Print / PDF instead.');
    } finally { btn.disabled = false; }
  });

  // ---------- My Garden ----------
  function gardenTasks() {
    const out = [];
    for (const g of state.garden) {
      g.plan.tasks.forEach((t, i) => out.push({ g, i, t, done: g.done.includes(i) }));
    }
    return out.sort((a, b) => a.t.date.localeCompare(b.t.date));
  }

  function renderGarden() {
    const body = $('#gardenBody');
    if (!state.garden.length) {
      body.innerHTML = `<div class="card empty"><h2>Your garden is empty</h2><p>Choose plants on the <b>Plant</b> tab, press 🌱 <b>Plant</b>, then <b>Save to My Garden</b>. Your tasks will show up here, week by week.</p></div>`;
      updateBadge();
      return;
    }
    const t0 = A.iso(A.today()), t7 = A.iso(A.addDays(A.today(), 7)), t30 = A.iso(A.addDays(A.today(), 30));
    const all = gardenTasks();
    const overdue = all.filter(x => !x.done && x.t.date < t0 && x.t.kind !== 'harvestend');
    const week = all.filter(x => x.t.date >= t0 && x.t.date <= t7);
    const month = all.filter(x => x.t.date > t7 && x.t.date <= t30);

    const taskRow = x => `<label class="task${x.done ? ' done' : ''}">
        <input type="checkbox" data-g="${x.g.id}" data-i="${x.i}" ${x.done ? 'checked' : ''}>
        <span class="t-icon">${KIND_ICON[x.t.kind] || '•'}</span>
        <span class="t-main"><b>${esc(x.g.plan.name)}</b> · ${esc(x.t.text)}<span class="t-date">${A.fmt(x.t.date, { weekday: true })}</span></span>
      </label>`;
    const section = (title, items, emptyText) => `<div class="card">
        <h2>${title}</h2>
        ${items.length ? items.map(taskRow).join('') : `<p class="muted">${emptyText}</p>`}
      </div>`;

    const plantings = [...state.garden].sort((a, b) => a.plan.name.localeCompare(b.plan.name));
    body.innerHTML = `
      ${overdue.length ? section('⏰ Overdue', overdue, '') : ''}
      ${section('This week', week, 'Nothing due in the next 7 days.')}
      ${section('Next 30 days', month, 'Nothing else this month.')}
      <div class="card">
        <div class="row-between"><h2>Plantings (${plantings.length})</h2>
          <button id="gardenIcs" class="btn small" type="button">📅 Export all to calendar</button></div>
        ${plantings.map(g => {
          const pl = g.plan, left = pl.tasks.length - g.done.length;
          return `<details class="planting">
            <summary><b>${esc(pl.name)}</b> <span class="muted">${esc(pl.action.toLowerCase())} ${A.fmt(pl.sow)} · harvest ${A.fmt(pl.harvest.from)}</span><span class="g-count">${left} left</span></summary>
            <div class="timeline">${pl.tasks.map((t, i) => taskRow({ g, i, t, done: g.done.includes(i) })).join('')}</div>
            <button class="link danger remove" data-g="${g.id}" type="button">Remove this planting</button>
          </details>`;
        }).join('')}
      </div>`;
    updateBadge();
  }

  $('#gardenBody').addEventListener('change', e => {
    const cb = e.target;
    if (cb.type !== 'checkbox' || !cb.dataset.g) return;
    const g = state.garden.find(x => x.id === cb.dataset.g), i = Number(cb.dataset.i);
    g.done = cb.checked ? [...new Set([...g.done, i])] : g.done.filter(x => x !== i);
    store.set('garden', state.garden);
    renderGarden();
  });
  $('#gardenBody').addEventListener('click', e => {
    if (e.target.id === 'gardenIcs') {
      const items = state.garden.flatMap(g => g.plan.tasks.filter((_, i) => !g.done.includes(i)).map(task => ({ name: g.plan.name, task })));
      shareOrDownload(`my-garden-${stamp()}.ics`, icsFor(items));
    }
    const rm = e.target.closest('.remove');
    if (rm && confirm('Remove this planting and its tasks?')) {
      state.garden = state.garden.filter(g => g.id !== rm.dataset.g);
      store.set('garden', state.garden);
      renderGarden();
    }
  });

  function updateBadge() {
    const t0 = A.iso(A.today()), t7 = A.iso(A.addDays(A.today(), 7));
    const n = gardenTasks().filter(x => !x.done && x.t.date <= t7 && (x.t.date >= t0 || x.t.kind !== 'harvestend')).length;
    const b = $('#taskBadge');
    b.hidden = !n;
    b.textContent = n;
  }

  // ---------- Misc ----------
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('Erase your location and saved garden from this device?')) return;
    store.clear();
    state.settings = null; state.garden = []; state.selected.clear();
    renderLocChip(); updateBadge();
    showTab('setup');
  });

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  // Offline support: service workers only run over http(s), not when opened as a file.
  const status = $('#offlineStatus');
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then(() => {
      status.textContent = '✓ Saved for offline use on this device.';
    }).catch(() => { status.textContent = 'Offline mode is unavailable in this browser.'; });
  } else if (location.protocol === 'file:') {
    status.textContent = 'Running from a local file: everything works offline already.';
  }

  renderLocChip();
  updateBadge();
  showTab(state.settings ? 'plan' : 'setup');
})();
