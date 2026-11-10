export const pad = (n) => String(n).padStart(2, '0');

/** Local date -> "YYYY-MM-DD" (used as the id of a day) */
export const dayId = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDayId = (id) => { const [y, m, d] = id.split('-').map(Number); return new Date(y, m - 1, d); };

export const fmtDate = (d, opts = { weekday: 'long', month: 'long', day: 'numeric' }) =>
  new Date(d).toLocaleDateString(undefined, opts);

export const fmtTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const sessionHours = (s) => (s.in && s.out ? Math.max(0, s.out - s.in) / 3.6e6 : 0);
export const dayHours = (d) => d.sessions.reduce((t, s) => t + sessionHours(s), 0);

export const fmtHours = (h) => {
  const mins = Math.round(h * 60);
  return `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;
};

export const fmtElapsed = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

/** ms timestamp -> "HH:MM" for <input type="time"> */
export const toTimeInput = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** day id + "HH:MM" -> ms */
export const fromTimeInput = (id, hhmm) => {
  const d = parseDayId(id);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A blank daily report. `date` is the day it belongs to; `status` is 'draft' until exported/filed. */
export const newDay = (name = '') => ({
  id: uid(), date: dayId(), status: 'draft', name,
  sessions: [], notes: '', volunteers: [], createdAt: Date.now(), updatedAt: Date.now(),
});
