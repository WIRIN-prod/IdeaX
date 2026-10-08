// Helpers shared by the server (validation) and the browser (inputs/formatting).

const MULT = { k: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, m: 1e6 };

/** "5 lakh" | "1.2cr" | "₹50,000" | "50k" | 75000 -> rupees (integer), or undefined if unparseable. */
export function parseAmount(v) {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
  const s = String(v).toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(k|lakhs?|lacs?|l|crores?|cr|m)?$/);
  if (!m) return undefined;
  return Math.round(parseFloat(m[1]) * (MULT[m[2]] ?? 1));
}

const trim2 = (x) => String(parseFloat(x.toFixed(2)));

/** Indian-style short money: ₹45,000 · ₹8 L · ₹1.2 Cr */
export function formatINR(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${trim2(n / 1e7)} Cr`;
  if (a >= 1e5) return `₹${trim2(n / 1e5)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function daysUntil(iso, now = new Date()) {
  const t = Date.parse(iso + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86400000);
}

export const SIDES = { bride: "Bride's side", groom: "Groom's side", both: 'Both sides' };
export const STATUS_HINTS = ['idea', 'shortlisted', 'to decide', 'booked', 'confirmed', 'paid', 'invited', 'pending', 'declined', 'done'];

export function statusTone(status) {
  const s = (status || '').toLowerCase();
  if (/(book|confirm|paid|done|final|yes|accept)/.test(s)) return 'good';
  if (/(idea|maybe|inspo|consider)/.test(s)) return 'idea';
  if (/(declin|cancel|reject|no$)/.test(s)) return 'bad';
  return 'warn';
}

/** Options that are still ideas, shortlisted, declined or parked are not committed spend. */
export const countsTowardBudget = (card) => card.stage !== 'parked' && !/(idea|shortlist|declin|cancel|reject|maybe|inspo|consider)/i.test(card.status || '');
