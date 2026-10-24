// Planting calendar engine: ZIP lookup, frost dates, planting windows and schedules.
// Pure functions only (no DOM), so the math is easy to test.
(function () {
  const DAY = 86400000;

  // ---------- Dates ----------
  // Dates are handled as local noon to stay clear of daylight-saving edge cases.
  const mk = (y, m, d) => new Date(y, m, d, 12);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const diffDays = (a, b) => Math.round((a - b) / DAY);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return mk(y, m - 1, d); };
  const today = () => { const n = new Date(); return mk(n.getFullYear(), n.getMonth(), n.getDate()); };
  const maxDate = (a, b) => (a > b ? a : b);
  const minDate = (a, b) => (a < b ? a : b);

  // ---------- ZIP lookup ----------
  let zipIndex = null;
  function lookupZip(zip) {
    if (!window.ZIPDATA) return null;
    if (!zipIndex) {
      zipIndex = new Map();
      for (const r of ZIPDATA.rec.split(';')) zipIndex.set(r.slice(0, 5), r);
    }
    const r = zipIndex.get(zip);
    if (!r) return null;
    const st = r.slice(6, 8);
    return {
      zip,
      zone: ZIPDATA.zones[r.charCodeAt(5) - 97],
      state: st === '--' ? '' : ZIPDATA.states[parseInt(st, 36)],
      city: r.slice(8),
    };
  }

  // ---------- Frost dates ----------
  // Typical (50% probability) last spring and first fall frost by hardiness zone, as
  // [month, day] pairs. Zones describe winter cold, not season length, so these are a
  // starting point: coastal and mountain areas can differ by weeks. Users can override.
  const ZONE_FROST = {
    '1a': [[6, 10], [8, 1]], '1b': [[6, 1], [8, 10]],
    '2a': [[5, 25], [8, 25]], '2b': [[5, 20], [9, 1]],
    '3a': [[5, 15], [9, 8]], '3b': [[5, 8], [9, 15]],
    '4a': [[5, 5], [9, 22]], '4b': [[4, 30], [9, 28]],
    '5a': [[4, 25], [10, 3]], '5b': [[4, 18], [10, 10]],
    '6a': [[4, 12], [10, 15]], '6b': [[4, 5], [10, 20]],
    '7a': [[3, 30], [10, 27]], '7b': [[3, 22], [11, 3]],
    '8a': [[3, 15], [11, 10]], '8b': [[3, 5], [11, 18]],
    '9a': [[2, 22], [11, 28]], '9b': [[2, 10], [12, 8]],
    '10a': [[1, 30], [12, 18]], '10b': [[1, 20], [12, 26]],
    '11a': [[1, 10], [12, 31]], '11b': [[1, 5], [12, 31]],
    '12a': [[1, 5], [12, 31]], '12b': [[1, 5], [12, 31]],
    '13a': [[1, 5], [12, 31]], '13b': [[1, 5], [12, 31]],
  };
  const ZONES = Object.keys(ZONE_FROST);
  const ZONE_TEMPS = { 1: -60, 2: -50, 3: -40, 4: -30, 5: -20, 6: -10, 7: 0, 8: 10, 9: 20, 10: 30, 11: 40, 12: 50, 13: 60 };
  function zoneTempRange(zone) {
    const n = parseInt(zone, 10);
    const lo = ZONE_TEMPS[n] + (zone.endsWith('b') ? 5 : 0);
    return `${lo} to ${lo + 5}°F`;
  }
  const isFrostFree = zone => parseInt(zone, 10) >= 11;

  // settings: { zone, lastFrost: 'MM-DD' | null, firstFrost: 'MM-DD' | null }
  function frostMonthDays(settings) {
    const [lf, ff] = ZONE_FROST[settings.zone] || ZONE_FROST['7a'];
    const parse = s => s.split('-').map(Number);
    return {
      lf: settings.lastFrost ? parse(settings.lastFrost) : lf,
      ff: settings.firstFrost ? parse(settings.firstFrost) : ff,
    };
  }
  function frostForYear(settings, year) {
    const { lf, ff } = frostMonthDays(settings);
    return { lf: mk(year, lf[0] - 1, lf[1]), ff: mk(year, ff[0] - 1, ff[1]) };
  }
  // The next last-spring-frost strictly after date d.
  function nextLastFrost(settings, d) {
    for (let y = d.getFullYear(); ; y++) {
      const { lf } = frostForYear(settings, y);
      if (lf > d) return lf;
    }
  }
  // The first fall frost on or after date d.
  function nextFirstFrost(settings, d) {
    for (let y = d.getFullYear(); ; y++) {
      const { ff } = frostForYear(settings, y);
      if (ff >= d) return ff;
    }
  }

  // ---------- Planting windows ----------
  const avgGerm = p => (p.germ ? (p.germ[0] + p.germ[1]) / 2 : 0);

  // All planting windows for one season year.
  function windowsForYear(p, settings, year) {
    const { lf, ff } = frostForYear(settings, year);
    const w = [];
    // Tender crops must also finish before fall frost: sowing stops once there is
    // not enough season left to reach first harvest.
    const lastUseful = days => addDays(ff, -Math.ceil(days + 7));
    if (p.indoor) {
      w.push({ type: 'indoor', start: addDays(lf, p.indoor[0] * 7), end: addDays(lf, p.indoor[1] * 7), lf, ff });
    }
    if (p.direct) {
      let end = addDays(lf, p.direct[1] * 7);
      if (p.hardy === 'tender' && !p.matFrom) end = minDate(end, lastUseful(p.mat + avgGerm(p)));
      const start = addDays(lf, p.direct[0] * 7);
      if (end >= start) w.push({ type: 'direct', start, end, lf, ff });
    }
    if (p.fall) {
      const type = p.fall.m === 'i' ? 'fallindoor' : 'falldirect';
      w.push({ type, start: addDays(ff, -p.fall.w[0] * 7), end: addDays(ff, -p.fall.w[1] * 7), lf, ff });
    }
    return w;
  }

  const ACTIONS = {
    indoor: 'Start seeds indoors',
    direct: 'Sow outdoors',
    fallindoor: 'Start indoors for fall',
    falldirect: 'Sow outdoors for fall',
  };
  function actionLabel(p, type) {
    if (!p.germ && type === 'direct') return p.id === 'sweetpotato' ? 'Plant slips' : 'Plant crowns';
    if (p.id === 'garlic') return 'Plant cloves';
    if (p.id === 'potato') return 'Plant seed potatoes';
    return ACTIONS[type];
  }

  // Status of a plant on date d: windows open now, and the next one coming up.
  function plantStatus(p, settings, d) {
    const y = d.getFullYear();
    const all = [y - 1, y, y + 1, y + 2].flatMap(yr => windowsForYear(p, settings, yr));
    const open = all.filter(w => w.start <= d && d <= w.end);
    const upcoming = all.filter(w => w.start > d).sort((a, b) => a.start - b.start);
    return { open, next: upcoming[0] || null };
  }

  // ---------- Schedule ----------
  // Build the dated schedule for planting p on date `sow` using window w.
  function schedule(p, settings, w, sow) {
    const tasks = [];
    const add = (date, kind, text) => tasks.push({ date: iso(date), kind, text });
    const indoor = w.type === 'indoor' || w.type === 'fallindoor';
    let ground = sow;

    add(sow, 'sow', actionLabel(p, w.type) + (p.depth ? `. Depth: ${p.depth}` : ''));
    let germ = null;
    if (p.germ) {
      germ = { from: iso(addDays(sow, p.germ[0])), to: iso(addDays(sow, p.germ[1])) };
      add(addDays(sow, p.germ[1]), 'germ', `Sprouts should be up by now (expect ${p.germ[0]}–${p.germ[1]} days)`);
    }

    let transplant = null;
    if (indoor) {
      const minAge = addDays(sow, (p.seedling || 6) * 7);
      ground = w.type === 'indoor' ? maxDate(minAge, addDays(w.lf, p.tp * 7)) : minAge;
      transplant = ground;
      const feed = addDays(sow, (p.germ ? p.germ[1] : 7) + 10);
      if (feed < addDays(ground, -7)) add(feed, 'fert', 'Feed seedlings with half-strength liquid fertilizer once true leaves appear');
      add(addDays(ground, -7), 'harden', 'Begin hardening off: set seedlings outside a few hours a day, longer each day');
      add(ground, 'transplant', `Transplant outdoors, ${p.space} apart`);
    }

    // Harvest
    let hStart;
    if (p.matFrom === 'lastfrost') {
      const lf = nextLastFrost(settings, ground);
      hStart = addDays(new Date(lf.getFullYear() + (p.years || 0), lf.getMonth(), lf.getDate(), 12), p.mat);
    } else {
      hStart = addDays(ground, p.mat);
    }
    let hEnd = addDays(hStart, p.hw);
    let frostWarning = null;
    if (p.hardy === 'tender' && !p.matFrom) {
      const ff = nextFirstFrost(settings, ground);
      if (hStart > ff) frostWarning = `May not mature before first frost (~${fmt(ff)}). Choose a fast variety or protect plants.`;
      else if (hEnd > ff) { hEnd = ff; frostWarning = `Harvest ends at first frost (~${fmt(ff)}); cover plants on cold nights to stretch it.`; }
    }
    const hLabel = p.bloom ? 'First blooms' : 'Harvest begins';
    add(hStart, 'harvest', `${hLabel}${p.years ? ' (first light harvest)' : ''}`);
    if (!frostWarning || hEnd > hStart) add(hEnd, 'harvestend', p.bloom ? 'Blooming tapers off' : 'Harvest window ends');

    // Fertilizer
    const anchors = { sow, ground, harvest: hStart, lastfrost: nextLastFrost(settings, ground) };
    for (const [anchor, offset, text] of p.fert) {
      const date = addDays(anchors[anchor], offset);
      if (date < sow || date > hEnd) continue;
      add(date, 'fert', text);
    }

    // Succession sowings, only for crops sown in the ground
    const succession = [];
    if (p.succ && !indoor) {
      for (let k = 1, s = addDays(sow, p.succ); s <= w.end && k <= 8; k++, s = addDays(s, p.succ)) succession.push(iso(s));
      for (const s of succession) add(parseIso(s), 'succ', `Succession sowing: sow another round of ${p.name.toLowerCase()}`);
    }

    tasks.sort((a, b) => a.date.localeCompare(b.date) || order(a.kind) - order(b.kind));
    return {
      plantId: p.id, name: p.name, method: w.type, action: actionLabel(p, w.type),
      sow: iso(sow), germ, transplant: transplant && iso(transplant), harden: transplant && iso(addDays(transplant, -7)),
      harvest: { from: iso(hStart), to: iso(hEnd) }, frostWarning, succession, tasks,
      window: { start: iso(w.start), end: iso(w.end) },
    };
  }
  const KIND_ORDER = ['sow', 'germ', 'fert', 'harden', 'transplant', 'succ', 'harvest', 'harvestend'];
  const order = k => KIND_ORDER.indexOf(k);

  // Pick the window for planting p on/around date d: an open window plants on d;
  // otherwise plan for the start of the next window.
  function planPlant(p, settings, d) {
    const st = plantStatus(p, settings, d);
    // Prefer an outdoor sowing over an indoor start when both are open.
    const pref = ['direct', 'falldirect', 'indoor', 'fallindoor'];
    const open = st.open.sort((a, b) => pref.indexOf(a.type) - pref.indexOf(b.type))[0];
    if (open) return { ...schedule(p, settings, open, d), plannedAhead: false };
    if (st.next) return { ...schedule(p, settings, st.next, st.next.start), plannedAhead: true };
    return null;
  }

  // ---------- Companion check ----------
  function companionReport(ids) {
    const conflicts = [], friends = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = PLANTS_BY_ID[ids[i]], b = PLANTS_BY_ID[ids[j]];
        if (a.avoid.includes(b.id)) conflicts.push([a.name, b.name]);
        else if (a.comp.includes(b.id)) friends.push([a.name, b.name]);
      }
    }
    return { conflicts, friends };
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmt(d, opts = {}) {
    if (typeof d === 'string') d = parseIso(d);
    const s = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    const withYear = opts.year || d.getFullYear() !== today().getFullYear();
    return (opts.weekday ? WEEKDAYS[d.getDay()] + ', ' : '') + s + (withYear ? `, ${d.getFullYear()}` : '');
  }

  window.Almanac = {
    mk, addDays, diffDays, iso, parseIso, today, fmt, MONTHS,
    lookupZip, ZONES, ZONE_FROST, zoneTempRange, isFrostFree, frostForYear, frostMonthDays,
    plantStatus, planPlant, actionLabel, companionReport,
  };
})();
