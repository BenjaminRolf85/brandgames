// Certificate page (zertifikat.html, short address /z): turns the six-character code from the
// headset into the AI licence. The name is typed here and stays on this device.
import { BADGES, decodeCertificate, prettyCode } from './badges.js';
import { iconSVG } from './icons.js';
import { getLang, setLang, onLangChange } from './i18n.js';

const NAME_KEY = 'kiar.certName';

const TEXT = {
  de: {
    appTitle: 'Echomotion AR Experience',
    codeLabel: 'Code aus der Brille',
    show: 'Anzeigen',
    codeError: 'Dieser Code passt nicht. Bitte prüfe die sechs Zeichen.',
    nameLabel: 'Dein Name auf dem Zertifikat',
    namePlaceholder: 'Vorname Nachname',
    eyebrow: 'Echomotion AR Experience · Zertifikat',
    title: 'KI-Führerschein',
    awardedTo: 'verliehen an',
    noName: 'Dein Name',
    summary: '{n} von {total} KI-Themen gemeistert',
    summaryAll: 'Alle {total} KI-Themen gemeistert',
    open: 'noch offen',
    date: 'Datum',
    presented: 'Präsentiert von',
    print: 'Drucken oder als PDF speichern',
    share: 'Teilen',
    toApp: 'Zur App',
    privacy: 'Dein Name wird nicht übertragen und nur auf diesem Gerät gemerkt. Das Zertifikat ist eine Spiel-Auszeichnung von Echomotion AR Experience.',
    ctaTitle: 'Lust auf mehr KI-Wissen?',
    ctaText: 'Echomotion bringt KI mit Trainings, Beratung und Lösungen in dein Team.',
    ctaButton: 'echomotion.ai besuchen',
    shareText: 'Mein KI-Führerschein von Echomotion AR Experience',
    pageTitle: 'KI-Führerschein | by Echomotion',
  },
  en: {
    appTitle: 'Echomotion AR Experience',
    codeLabel: 'Code from the headset',
    show: 'Show',
    codeError: 'This code does not fit. Please check the six characters.',
    nameLabel: 'Your name on the certificate',
    namePlaceholder: 'First and last name',
    eyebrow: 'Echomotion AR Experience · Certificate',
    title: 'AI licence',
    awardedTo: 'awarded to',
    noName: 'Your name',
    summary: '{n} of {total} AI topics mastered',
    summaryAll: 'All {total} AI topics mastered',
    open: 'still open',
    date: 'Date',
    presented: 'Presented by',
    print: 'Print or save as PDF',
    share: 'Share',
    toApp: 'To the app',
    privacy: 'Your name is not sent anywhere and is only remembered on this device. The certificate is a game award of Echomotion AR Experience.',
    ctaTitle: 'Want more AI know-how?',
    ctaText: 'Echomotion brings AI to your team with trainings, consulting and solutions.',
    ctaButton: 'Visit echomotion.ai',
    shareText: 'My AI licence from Echomotion AR Experience',
    pageTitle: 'AI licence | by Echomotion',
  },
};

const $ = (id) => document.getElementById(id);
const tx = (key, vars = {}) => (TEXT[getLang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const params = new URLSearchParams(location.search);
if (params.get('l') === 'de' || params.get('l') === 'en') setLang(params.get('l'));

let cert = null;
let code = '';

function readName() {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

function render() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = tx('pageTitle');
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = tx(el.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.lang === lang)));
  $('name').placeholder = tx('namePlaceholder');

  $('cert').hidden = !cert;
  $('actions').hidden = !cert;
  if (!cert) return;
  const name = $('name').value.trim();
  $('cert-name').textContent = name || tx('noName');
  $('cert-name').classList.toggle('cert__name--empty', !name);
  const n = cert.ids.length;
  $('cert-summary').textContent = tx(n === BADGES.length ? 'summaryAll' : 'summary', { n, total: BADGES.length });
  $('cert-date').textContent = cert.date.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const list = $('badges');
  list.replaceChildren(...[...BADGES].sort((a, b) => cert.ids.includes(b.id) - cert.ids.includes(a.id)).map((b) => {
    const earned = cert.ids.includes(b.id);
    const li = document.createElement('li');
    li.className = `badge ${earned ? 'badge--earned' : 'badge--open'}`;
    const medal = document.createElement('span');
    medal.className = 'badge__medal';
    medal.innerHTML = iconSVG(b.game, 24);
    const label = document.createElement('span');
    label.className = 'badge__name';
    label.textContent = b.name[lang];
    const how = document.createElement('span');
    how.className = 'badge__how';
    how.textContent = earned ? b.how[lang] : `${tx('open')} · ${b.how[lang]}`;
    label.append(how);
    li.append(medal, label);
    return li;
  }));
}

function load(raw, { focusName = false } = {}) {
  const decoded = decodeCertificate(raw);
  $('code-error').hidden = !!decoded || !raw;
  if (!decoded) { cert = null; render(); return; }
  cert = decoded;
  code = raw.toUpperCase().replace(/[\s-]/g, '');
  $('code').value = prettyCode(code);
  const url = new URL(location.href);
  url.searchParams.set('c', code);
  url.searchParams.delete('n');
  history.replaceState(null, '', url);
  render();
  if (focusName && !$('name').value) $('name').focus();
}

$('name').value = (params.get('n') ?? readName()).slice(0, 40);
$('name').addEventListener('input', () => {
  try { localStorage.setItem(NAME_KEY, $('name').value.trim()); } catch { /* private mode */ }
  render();
});
$('form').addEventListener('submit', (e) => { e.preventDefault(); load($('code').value, { focusName: true }); });
$('print').addEventListener('click', () => window.print());
if (navigator.share) {
  $('share').hidden = false;
  $('share').addEventListener('click', () => {
    const url = new URL(location.href);
    url.searchParams.set('c', code);
    url.searchParams.set('l', getLang());
    navigator.share({ title: tx('title'), text: tx('shareText'), url: url.toString() }).catch(() => {});
  });
}
document.querySelectorAll('[data-lang]').forEach((el) => el.addEventListener('click', () => setLang(el.dataset.lang)));
onLangChange(render);
render();
if (params.get('c')) load(params.get('c'));
else $('code').focus();
