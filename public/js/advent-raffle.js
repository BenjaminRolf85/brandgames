// The raffle behind door 24 of the advent calendar: places at our AI event in Frankfurt
// (Monday, 15 March 2027). A short form (name, company, e-mail, consent) that posts to
// netlify/functions/raffle.mjs. What is typed survives a language switch; after a successful
// entry the device only remembers "took part" (no personal data in the browser).
// All colors and sizes are design tokens (tokens.css, --advent-* and --color-advent-*).
import { t, getLang } from './i18n.js';

const API = '/api/raffle';
const DONE_KEY = 'kiar.raffle';
export const PRIVACY_URL = 'https://www.echomotion.ai/datenschutz/';
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;.]{2,}$/;
const draft = { name: '', company: '', email: '', consent: false };
let closed = false; // the server said the raffle is over

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const isDone = () => { try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; } };
const setDone = () => { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* private mode */ } };

function field(id, label, type, autocomplete, max) {
  const wrap = el('label', 'advent-field');
  const input = Object.assign(el('input', 'advent-field__input'), { id: `raffle-${id}`, name: id, type, autocomplete, maxLength: max, required: true, value: draft[id] });
  if (type === 'email') { input.inputMode = 'email'; input.autocapitalize = 'off'; input.spellcheck = false; }
  input.addEventListener('input', () => { draft[id] = input.value; input.removeAttribute('aria-invalid'); });
  wrap.append(el('span', 'advent-field__label', label), input);
  return { wrap, input };
}

function note(title, text) {
  const box = el('div', 'advent-raffle__note');
  box.setAttribute('role', 'status');
  box.append(el('p', 'advent-raffle__note-title', title), el('p', 'advent-raffle__note-text', text));
  return box;
}

function form(slot) {
  const f = el('form', 'advent-raffle__form');
  f.noValidate = true;
  const name = field('name', t('adventRaffleName'), 'text', 'name', 60);
  const company = field('company', t('adventRaffleCompany'), 'text', 'organization', 80);
  const email = field('email', t('adventRaffleEmail'), 'email', 'email', 120);
  // A field people never see; form robots fill it in and the server drops the entry.
  const trap = Object.assign(el('input', 'advent-raffle__trap'), { name: 'website', type: 'text', tabIndex: -1, autocomplete: 'off' });
  trap.setAttribute('aria-hidden', 'true');

  const consent = el('label', 'advent-check');
  const box = Object.assign(el('input', 'advent-check__box'), { id: 'raffle-consent', type: 'checkbox', checked: draft.consent, required: true });
  box.addEventListener('change', () => { draft.consent = box.checked; box.removeAttribute('aria-invalid'); });
  const words = el('span', 'advent-check__text', `${t('adventRaffleConsent')} `);
  words.append(Object.assign(el('a', 'advent-raffle__link', t('adventRafflePrivacy')), { href: PRIVACY_URL, target: '_blank', rel: 'noopener' }));
  consent.append(box, words);

  const status = el('p', 'advent-raffle__status');
  status.setAttribute('role', 'alert');
  const send = Object.assign(el('button', 'btn btn--primary', t('adventRaffleSubmit')), { type: 'submit' });
  const fail = (key, input) => {
    status.textContent = t(key);
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  };

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = '';
    const data = { name: draft.name.trim(), company: draft.company.trim(), email: draft.email.trim(), consent: draft.consent, lang: getLang(), website: trap.value };
    if (data.name.length < 2) return fail('adventRaffleErrName', name.input);
    if (data.company.length < 2) return fail('adventRaffleErrCompany', company.input);
    if (!EMAIL_RE.test(data.email)) return fail('adventRaffleErrEmail', email.input);
    if (!data.consent) return fail('adventRaffleErrConsent', box);
    send.disabled = true;
    send.textContent = t('adventRaffleSending');
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
      const out = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone();
        Object.assign(draft, { name: '', company: '', email: '', consent: false });
        slot.replaceChildren(note(t('adventRaffleDone'), t('adventRaffleDoneText')));
        return;
      }
      if (out.error === 'closed') { closed = true; slot.replaceChildren(note(t('adventRaffleClosed'), t('adventRaffleClosedText'))); return; }
      fail({ early: 'adventRaffleErrEarly', 'invalid name': 'adventRaffleErrName', 'invalid company': 'adventRaffleErrCompany', 'invalid email': 'adventRaffleErrEmail', 'consent required': 'adventRaffleErrConsent' }[out.error] ?? 'adventRaffleErrNet',
        { 'invalid name': name.input, 'invalid company': company.input, 'invalid email': email.input }[out.error]);
    } catch {
      fail('adventRaffleErrNet');
    }
    send.disabled = false;
    send.textContent = t('adventRaffleSubmit');
  });

  f.append(name.wrap, company.wrap, email.wrap, trap, consent, status, send);
  return f;
}

/** The raffle card for the dialog of door 24: the event, its program and the entry form. */
export function raffleCard() {
  const card = el('section', 'advent-raffle');
  const title = el('h3', 'advent-raffle__title', t('adventRaffleTitle'));
  title.id = 'advent-raffle-title';
  card.setAttribute('aria-labelledby', title.id);
  const plan = el('ul', 'advent-raffle__plan');
  for (const n of [1, 2]) {
    const li = el('li', 'advent-raffle__step');
    li.append(el('span', 'advent-raffle__time', t(`adventRaffleTime${n}`)), el('span', 'advent-raffle__what', t(`adventRaffleSlot${n}`)));
    plan.append(li);
  }
  const slot = el('div', 'advent-raffle__slot');
  if (closed) slot.append(note(t('adventRaffleClosed'), t('adventRaffleClosedText')));
  else if (isDone()) slot.append(note(t('adventRaffleDone'), t('adventRaffleDoneText')));
  else {
    slot.append(form(slot));
    // After the closing date the form gives way to a short note.
    fetch(API, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (s && s.open === false && Date.now() >= s.until && slot.isConnected) { closed = true; slot.replaceChildren(note(t('adventRaffleClosed'), t('adventRaffleClosedText'))); }
    }).catch(() => {});
  }
  const terms = el('details', 'advent-case__more advent-raffle__terms');
  terms.append(el('summary', '', t('adventRaffleTerms')), el('p', 'advent-raffle__terms-text', t('adventRaffleTermsText')));
  card.append(el('p', 'advent-dialog__eyebrow', t('adventRaffleEyebrow')), title, el('p', 'advent-raffle__when', t('adventRaffleWhen')), plan, slot, terms);
  return card;
}
