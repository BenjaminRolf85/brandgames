// The AI coach of "Gipfelgespräch": a small, real sentiment analysis on the customer's words.
// It works like the classic lexicon method: every known signal word votes for a mood
// (interested, reserved, skeptical, ready to buy) and for a customer type (analytical,
// relationship-oriented, decisive). Two simple rules help: a negation ("not good") flips a
// positive word, and after "but" the words count more than before it. The votes become
// probabilities with a softmax, so the coach can be sure or unsure. The customer type adds up
// over the whole conversation, so the coach grows more certain with every line.
// What it cannot do on purpose: hear irony, hesitation or context. That is the lesson.
// Pure functions, no imports.

// [stem, { mood votes }, { type votes }]. Stems of up to 3 letters must match a whole word.
// I interested, R reserved, S skeptical, B ready to buy; A analytical, Rel relational, D decisive.
const LEX = {
  de: [
    ['gut', { I: 1.0 }], ['super', { I: 1.2 }], ['toll', { I: 1.3 }], ['schön', { I: 1.1 }], ['interessant', { I: 1.4 }],
    ['gern', { I: 0.8 }], ['sympathisch', { I: 1.3 }, { Rel: 1.1 }], ['freu', { I: 1.0 }], ['prima', { I: 1.0 }],
    ['spannend', { I: 1.2 }], ['gefällt', { I: 1.4 }], ['gemütlich', { I: 0.9 }, { Rel: 1.2 }], ['wohlfühl', { I: 0.9 }, { Rel: 1.2 }],
    ['klingt', { I: 0.4 }], ['kaffee', { I: 0.5 }, { Rel: 0.8 }], ['empfohlen', { I: 0.9 }, { Rel: 0.9 }], ['rein', { I: 0.3 }], ['spare', { I: 1.1 }, { A: 0.4 }],
    ['aber', { S: 0.8 }], ['teuer', { S: 1.4 }], ['preis', { S: 0.7 }, { A: 0.3 }], ['kein', { S: 0.9 }], ['keine', { S: 0.9 }],
    ['nicht', { S: 0.45 }], ['fehler', { S: 1.0 }, { A: 0.5 }], ['kaputt', { S: 1.3 }], ['sorge', { S: 1.2 }], ['risiko', { S: 1.2 }],
    ['ehrlich', { S: 0.5 }], ['schief', { S: 1.0 }], ['ärger', { S: 1.2 }], ['eng', { S: 0.7 }], ['leer', { S: 0.6 }],
    ['kostet', { S: 0.7 }, { A: 0.5 }], ['viele', { S: 0.3 }], ['hm', { S: 0.6, R: 0.5 }], ['weiß', { S: 0.4, R: 0.6 }],
    ['geld', { S: 0.6 }, { A: 0.2 }], ['wettbewerb', { S: 0.6 }, { A: 0.6 }], ['über', { S: 0.2 }], ['online', { S: 0.6 }, { A: 0.4 }],
    ['gesehen', { S: 0.4 }], ['lang', { S: 0.5 }], ['werbe', { S: 0.8 }], ['selbst', { S: 0.3 }],
    ['minuten', { R: 0.6 }, { D: 1.0 }], ['informiert', { R: 0.8 }, { A: 1.0 }], ['angebote', { R: 0.6 }, { A: 0.8 }],
    ['was', { R: 0.3 }], ['okay', { R: 0.6 }], ['habe', { R: 0.2 }], ['welches', { R: 0.4 }], ['warum', { R: 0.4 }, { A: 0.4 }],
    ['wann', { B: 1.3 }], ['starten', { B: 1.4 }], ['start', { B: 1.0 }], ['einführung', { B: 1.0 }, { A: 0.3 }],
    ['einbau', { B: 1.3 }], ['abholen', { B: 1.5 }], ['liefer', { B: 1.3 }], ['vertrag', { B: 1.2 }], ['weiter', { B: 1.3 }], ['jetzt', { B: 0.5 }],
    ['pilot', { B: 1.0 }], ['würden', { B: 0.5 }], ['könnten', { B: 0.6 }], ['könnte', { B: 0.6 }], ['inklusive', { B: 0.8 }],
    ['garantie', { B: 0.6 }, { A: 0.4 }], ['leasen', { B: 0.9 }, { D: 0.4 }], ['heute', { B: 0.6 }, { D: 1.0 }],
    ['zahl', {}, { A: 1.4 }], ['fakt', {}, { A: 1.4 }], ['euro', {}, { A: 1.0 }], ['prozent', {}, { A: 1.2 }],
    ['messwert', {}, { A: 1.5 }], ['konkret', {}, { A: 1.0 }], ['genau', {}, { A: 0.8 }], ['daten', {}, { A: 1.2 }],
    ['excel', {}, { A: 0.8 }], ['listen', {}, { A: 0.6 }], ['stromkosten', {}, { A: 1.0 }], ['kosten', {}, { A: 0.6 }],
    ['jahr', {}, { A: 0.4 }], ['vergleich', {}, { A: 1.0 }], ['planung', {}, { A: 0.6 }], ['gründlich', {}, { A: 1.0 }],
    ['team', {}, { Rel: 1.3 }], ['familie', {}, { Rel: 1.3 }], ['leute', {}, { Rel: 1.1 }], ['wir', {}, { Rel: 0.4 }],
    ['uns', {}, { Rel: 0.4 }], ['nachbarn', {}, { Rel: 1.0 }], ['neffe', {}, { Rel: 1.2 }], ['enkel', {}, { Rel: 1.3 }],
    ['gäste', {}, { Rel: 0.9 }], ['viertel', {}, { Rel: 0.8 }], ['jahren', {}, { Rel: 0.4 }], ['paul', {}, { Rel: 0.6 }],
    ['meint', {}, { Rel: 0.4 }], ['du', {}, { Rel: 0.4 }], ['mein', {}, { Rel: 0.4 }], ['meine', {}, { Rel: 0.4 }],
    ['schnell', {}, { D: 1.4 }], ['kurz', {}, { D: 1.3 }], ['sofort', {}, { D: 1.3 }], ['ergebnis', {}, { D: 1.4 }],
    ['direkt', {}, { D: 1.0 }], ['satz', {}, { D: 0.9 }], ['lösen', {}, { D: 1.0 }], ['zeit', {}, { D: 0.6 }],
    ['geht', {}, { D: 0.3 }], ['will', {}, { D: 0.8 }], ['hi', {}, { D: 0.5 }],
  ],
  en: [
    ['good', { I: 1.0 }], ['great', { I: 1.3 }], ['nice', { I: 1.1 }], ['interesting', { I: 1.4 }], ['like', { I: 1.1 }],
    ['love', { I: 1.2 }], ['glad', { I: 1.0 }], ['cosy', { I: 0.9 }, { Rel: 1.2 }], ['cozy', { I: 0.9 }, { Rel: 1.2 }],
    ['home', { I: 0.5 }, { Rel: 0.8 }], ['coffee', { I: 0.5 }, { Rel: 0.8 }], ['recommend', { I: 0.9 }, { Rel: 0.9 }],
    ['well', { I: 0.6 }], ['sounds', { I: 0.4 }], ['fine', { I: 0.6 }], ['come', { I: 0.3 }], ['save', { I: 1.1 }, { A: 0.4 }],
    ['but', { S: 0.8 }], ['expensive', { S: 1.4 }], ['price', { S: 0.7 }, { A: 0.3 }], ['no', { S: 0.8 }], ['not', { S: 0.6 }],
    ["don't", { S: 0.5 }], ['error', { S: 1.0 }, { A: 0.5 }], ['broken', { S: 1.3 }], ['worr', { S: 1.2 }],
    ['risk', { S: 1.2 }], ['honest', { S: 0.5 }], ['wrong', { S: 1.0 }], ['annoy', { S: 1.2 }], ['cramped', { S: 0.8 }],
    ['empty', { S: 0.6 }], ['costs', { S: 0.7 }, { A: 0.5 }], ['too', { S: 0.4 }], ['hmm', { S: 0.6, R: 0.5 }],
    ['money', { S: 0.6 }, { A: 0.2 }], ['competition', { S: 0.6 }, { A: 0.6 }], ['above', { S: 0.2 }], ['online', { S: 0.4 }, { A: 0.4 }],
    ['saw', { S: 0.3 }], ['long', { S: 0.5 }], ['sales', { S: 0.8 }], ['himself', { S: 0.3 }],
    ['minutes', { R: 0.6 }, { D: 1.0 }], ['research', { R: 0.8 }, { A: 1.0 }], ['quotes', { R: 0.6 }, { A: 0.8 }],
    ['what', { R: 0.3 }], ['okay', { R: 0.6 }], ['have', { R: 0.2 }], ['which', { R: 0.4 }], ['why', { R: 0.4 }, { A: 0.4 }],
    ['when', { B: 1.3 }], ['start', { B: 1.2 }], ['ahead', { B: 1.0 }], ['rollout', { B: 1.0 }, { A: 0.3 }],
    ['install', { B: 1.3 }], ['pick', { B: 1.2 }], ['deliver', { B: 1.3 }], ['contract', { B: 1.2 }], ['next', { B: 1.3 }], ['happens', { B: 0.4 }],
    ['pilot', { B: 1.0 }], ['would', { B: 0.4 }], ['could', { B: 0.6 }], ['included', { B: 0.8 }],
    ['warranty', { B: 0.6 }, { A: 0.4 }], ['lease', { B: 0.9 }, { D: 0.4 }], ['today', { B: 0.6 }, { D: 1.0 }], ['much', { B: 0.5 }],
    ['number', {}, { A: 1.4 }], ['fact', {}, { A: 1.4 }], ['euro', {}, { A: 1.0 }], ['cent', {}, { A: 1.2 }],
    ['measure', {}, { A: 1.5 }], ['concrete', {}, { A: 1.0 }], ['exact', {}, { A: 0.8 }], ['data', {}, { A: 1.2 }],
    ['spreadsheet', {}, { A: 0.9 }], ['electricity', {}, { A: 0.7 }], ['bill', {}, { A: 0.6 }], ['cost', {}, { A: 0.6 }],
    ['year', {}, { A: 0.4 }], ['compar', {}, { A: 1.0 }], ['planning', {}, { A: 0.6 }], ['terms', {}, { A: 0.5 }],
    ['team', {}, { Rel: 1.3 }], ['family', {}, { Rel: 1.3 }], ['people', {}, { Rel: 1.1 }], ['we', {}, { Rel: 0.4 }],
    ['us', {}, { Rel: 0.4 }], ['our', {}, { Rel: 0.3 }], ['neighbour', {}, { Rel: 1.0 }], ['nephew', {}, { Rel: 1.2 }],
    ['grandchild', {}, { Rel: 1.3 }], ['guests', {}, { Rel: 0.9 }], ['years', {}, { Rel: 0.4 }], ['paul', {}, { Rel: 0.6 }],
    ['my', {}, { Rel: 0.4 }], ['says', {}, { Rel: 0.3 }],
    ['fast', {}, { D: 1.4 }], ['brief', {}, { D: 1.3 }], ['quick', {}, { D: 1.3 }], ['result', {}, { D: 1.4 }],
    ['straight', {}, { D: 1.0 }], ['sentence', {}, { D: 0.9 }], ['fix', {}, { D: 1.0 }], ['time', {}, { D: 0.6 }],
    ['want', {}, { D: 0.8 }], ['hi', {}, { D: 0.5 }],
  ],
};
const NEGATORS = new Set(['nicht', 'kein', 'keine', 'keinen', 'nie', 'not', 'no', 'never', "don't", "isn't", "won't", "can't", "mustn't"]);
const CONTRAST = new Set(['aber', 'doch', 'but', 'however']);
const MOOD_KEYS = { I: 'interested', R: 'reserved', S: 'skeptical', B: 'ready' };
const TYPE_KEYS = { A: 'analytical', Rel: 'relational', D: 'decisive' };
const MOOD_PRIOR = { I: 0, R: 0.55, S: 0, B: 0 };
const T_MOOD = 0.8; // softmax temperature (lower = more confident)
const T_TYPE = 0.9;

function softmax(scores, temp) {
  const keys = Object.keys(scores);
  const max = Math.max(...keys.map((k) => scores[k]));
  const ex = keys.map((k) => Math.exp((scores[k] - max) / temp));
  const sum = ex.reduce((a, b) => a + b, 0);
  const out = {};
  keys.forEach((k, i) => { out[k] = ex[i] / sum; });
  return out;
}

/** Words of a line (lower case, punctuation removed) with their character spans in the text. */
export function tokenize(text) {
  const out = [];
  const re = /[\p{L}\p{N}'’-]+/gu;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    // Split hyphenated words (Excel-Listen, Computer-Profis) into their parts for matching.
    const parts = raw.split('-');
    let at = m.index;
    for (const p of parts) {
      if (p) out.push({ word: p.toLowerCase().replace('’', "'"), start: at, end: at + p.length });
      at += p.length + 1;
    }
  }
  return out;
}

function lookup(lang, word) {
  for (const [stem, mood, type] of LEX[lang] ?? LEX.en) {
    const hit = stem.length <= 3 ? word === stem : word.startsWith(stem);
    if (hit) return { stem, mood, type: type ?? {} };
  }
  return null;
}

/**
 * Reads one line. Returns { mood: [{ key, p }] sorted, type: { A, Rel, D } raw votes,
 * hits: [{ start, end, word, cls, weight }] } where cls is the class the word voted for most.
 */
export function readLine(text, lang) {
  const toks = tokenize(text);
  const scores = { ...MOOD_PRIOR };
  const type = { A: 0, Rel: 0, D: 0 };
  const hits = [];
  const cut = toks.findIndex((t) => CONTRAST.has(t.word));
  toks.forEach((tok, i) => {
    const e = lookup(lang, tok.word);
    if (!e) return;
    // After "but" the words weigh more, before it less.
    const w = cut < 0 ? 1 : i < cut ? 0.6 : i > cut ? 1.6 : 1;
    const negated = toks.slice(Math.max(0, i - 2), i).some((p) => NEGATORS.has(p.word));
    const m = { ...e.mood };
    if (negated && m.I) { m.S = (m.S ?? 0) + m.I; delete m.I; }
    for (const k in m) scores[k] += m[k] * w;
    for (const k in e.type) type[k] += e.type[k] * w;
    // The class this word voted for most (moods first; type-only words show their type).
    const best = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    const bestT = Object.entries(e.type).sort((a, b) => b[1] - a[1])[0];
    if (best || bestT) hits.push({ start: tok.start, end: tok.end, word: tok.word, cls: best ? MOOD_KEYS[best[0]] : TYPE_KEYS[bestT[0]], weight: (best?.[1] ?? bestT[1]) * w });
  });
  const p = softmax(scores, T_MOOD);
  const mood = Object.keys(p).map((k) => ({ key: MOOD_KEYS[k], p: p[k] })).sort((a, b) => b.p - a.p);
  return { mood, type, hits };
}

/** The customer type from the votes of all lines so far: [{ key, p }] sorted. */
export function readType(votes) {
  const s = { A: 0.3 + votes.A, Rel: 0.3 + votes.Rel, D: 0.3 + votes.D };
  const p = softmax(s, T_TYPE);
  return Object.keys(p).map((k) => ({ key: TYPE_KEYS[k], p: p[k] })).sort((a, b) => b.p - a.p);
}

/** Unsure when the best guess is weak or the second is close. */
export const isUnsure = (list) => list[0].p < 0.45 || list[0].p - list[1].p < 0.12;
