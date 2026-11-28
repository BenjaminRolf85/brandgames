// Raffle behind door 24 of the advent calendar: places at our AI event (Frankfurt, 15 March 2027).
//   POST   /api/raffle  { name, company, email, consent: true, lang }   one entry per e-mail address
//   GET    /api/raffle                                                   { open, from, until }
//   GET    /api/raffle  + "authorization: Bearer <RAFFLE_KEY>"           { entries, count } for the organizer
//   DELETE /api/raffle?id=<entry id> + the same header                   removes one entry
// Entries are accepted from 24 December until the closing date (Europe/Berlin); with the
// organizer's key also outside that window (to check the form before the day).
// Stored per entry: name, company, e-mail, language, time. No IP address, no cookie.
// The key is the environment variable RAFFLE_KEY (set on the site, never in the repository);
// without it the list cannot be read.
import { getStore } from '@netlify/blobs';
import { createHash, timingSafeEqual } from 'node:crypto';

// Midnight in Germany is 23:00 UTC of the day before (winter time).
export const OPEN_FROM = Date.parse('2026-12-23T23:00:00Z'); // 24 Dec 2026, 00:00
export const OPEN_UNTIL = Date.parse('2027-01-06T23:00:00Z'); // 6 Jan 2027, 24:00
const MAX_ENTRIES = 5000;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;.]{2,}$/;
const TEXT_RE = /^[^\p{C}<>]*$/u; // no control characters, no markup

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const entryId = (email) => createHash('sha256').update(email).digest('hex').slice(0, 32);

function isOrganizer(req, secret) {
  if (!secret) return false;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function handle(req, store, { now = Date.now(), secret = '' } = {}) {
  const url = new URL(req.url);
  const organizer = isOrganizer(req, secret);
  const asksAsOrganizer = req.headers.has('authorization');

  if (req.method === 'GET') {
    if (!asksAsOrganizer) return json({ open: now >= OPEN_FROM && now < OPEN_UNTIL, from: OPEN_FROM, until: OPEN_UNTIL });
    if (!secret) return json({ error: 'not configured' }, 503);
    if (!organizer) return json({ error: 'forbidden' }, 403);
    const { blobs } = await store.list({ prefix: 'entry/' });
    const entries = (await Promise.all(blobs.map(async ({ key }) => {
      const e = await store.get(key, { type: 'json' });
      return e ? { id: key.slice('entry/'.length), ...e } : null;
    }))).filter(Boolean).sort((a, b) => a.date - b.date);
    return json({ count: entries.length, from: OPEN_FROM, until: OPEN_UNTIL, entries });
  }

  if (req.method === 'DELETE') {
    if (!secret) return json({ error: 'not configured' }, 503);
    if (!organizer) return json({ error: 'forbidden' }, 403);
    const id = url.searchParams.get('id') ?? '';
    if (!/^[0-9a-f]{32}$/.test(id)) return json({ error: 'invalid id' }, 400);
    await store.delete(`entry/${id}`);
    return json({ ok: true });
  }

  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 2000) return json({ error: 'too large' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'invalid json' }, 400); }
    if (!organizer) {
      if (now < OPEN_FROM) return json({ error: 'early', from: OPEN_FROM }, 403);
      if (now >= OPEN_UNTIL) return json({ error: 'closed', until: OPEN_UNTIL }, 403);
    }
    // A field people never see: filled in means a form robot. Answer as if it had worked.
    if (clean(body?.website)) return json({ ok: true }, 201);
    const name = clean(body?.name);
    const company = clean(body?.company);
    const email = clean(body?.email).toLowerCase();
    if (name.length < 2 || name.length > 60 || !TEXT_RE.test(name)) return json({ error: 'invalid name' }, 400);
    if (company.length < 2 || company.length > 80 || !TEXT_RE.test(company)) return json({ error: 'invalid company' }, 400);
    if (email.length > 120 || !EMAIL_RE.test(email)) return json({ error: 'invalid email' }, 400);
    if (body?.consent !== true) return json({ error: 'consent required' }, 400);

    const key = `entry/${entryId(email)}`;
    const before = await store.get(key, { type: 'json' });
    if (!before) {
      const { blobs } = await store.list({ prefix: 'entry/' });
      if (blobs.length >= MAX_ENTRIES) return json({ error: 'full' }, 503);
    }
    // The same address again replaces the entry: one lot per person.
    await store.setJSON(key, { name, company, email, lang: body?.lang === 'en' ? 'en' : 'de', date: before?.date ?? now, ...(organizer ? { test: true } : {}) });
    return json({ ok: true, again: Boolean(before) }, before ? 200 : 201);
  }
  return json({ error: 'method not allowed' }, 405);
}

export default async (req) => handle(req, getStore({ name: 'raffle', consistency: 'strong' }), { secret: Netlify.env.get('RAFFLE_KEY') ?? '' });

export const config = {
  path: '/api/raffle',
  method: ['GET', 'POST', 'DELETE'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
