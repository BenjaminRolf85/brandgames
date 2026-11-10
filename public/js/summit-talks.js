// "Gipfelgespräch" content: the stages of a sales conversation (one section of the climbing wall
// each) and the customers, each a full climb with one line per stage and three replies.
// q: 2 = strong reply (solid hold), 1 = acceptable (wobbly hold), 0 = weak (the hold crumbles).
// mood: how the customer really feels (the AI coach guesses it from the words alone):
//   interested, reserved, skeptical, ready (a buying signal).
// note: what a person reads in the line where word counting goes wrong (irony, hesitation,
// problem words that are not meant against you).
// look: the token colors of the customer's figure (summit-customer.js, built in Blender).
// Pure data, no imports (also used by the test scripts).

export const STAGES = [
  { key: 'open', name: { de: 'Eröffnung', en: 'Opening' }, goal: { de: 'Beziehung aufbauen', en: 'Build rapport' } },
  { key: 'needs', name: { de: 'Bedarf', en: 'Needs' }, goal: { de: 'Offene Fragen, zuhören', en: 'Open questions, listen' } },
  { key: 'value', name: { de: 'Nutzen', en: 'Value' }, goal: { de: 'Nutzen statt Merkmale', en: 'Value, not features' } },
  { key: 'objection', name: { de: 'Einwände', en: 'Objections' }, goal: { de: 'Verständnis und Frage', en: 'Empathy and a question' } },
  { key: 'close', name: { de: 'Abschluss', en: 'Closing' }, goal: { de: 'Kaufsignal nutzen', en: 'Use the buying signal' } },
];

export const MOODS = ['interested', 'reserved', 'skeptical', 'ready'];
export const TYPES = ['analytical', 'relational', 'decisive'];

export const CUSTOMERS = [
  {
    key: 'albers', type: 'analytical', market: 'B2B',
    name: { de: 'Dr. Katrin Albers', en: 'Dr Katrin Albers' },
    role: { de: 'Leiterin Finanzen, Maschinenbau', en: 'Head of Finance, engineering firm' },
    topic: { de: 'sucht eine Software für die Finanzplanung', en: 'is looking for financial planning software' },
    look: { suit: 'xr-summit-cloth-navy', shirt: 'xr-summit-cloth-white', pants: 'xr-summit-cloth-navy', hair_c: 'xr-summit-hair-brown', skin: 'xr-summit-skin-1', accent: 'xr-summit-cloth-teal', iris: 'xr-summit-iris-green', lips: 'xr-summit-lips-rose', shoe: 'xr-summit-shoe' },
    steps: [
      {
        say: { de: 'Guten Tag. Ich habe 30 Minuten. Bitte keine Werbefolien – ich brauche Zahlen und Fakten.', en: 'Good afternoon. I have 30 minutes. No sales slides, please – I need numbers and facts.' },
        mood: 'skeptical',
        replies: [
          { q: 2, text: { de: 'Gern. Welche Zahlen sind für Ihre Entscheidung am wichtigsten?', en: 'Sure. Which numbers matter most for your decision?' }, tip: { de: 'Respektiert ihren Wunsch und lässt sie den Rahmen setzen.', en: 'Respects her wish and lets her set the frame.' } },
          { q: 1, text: { de: 'Verstanden. Ich zeige Ihnen direkt unsere Kennzahlen.', en: "Understood. I'll show you our key figures right away." }, tip: { de: 'Fakten ja – aber Sie wissen noch nicht, welche ihr wichtig sind.', en: "Facts, yes – but you don't know yet which ones matter to her." } },
          { q: 0, text: { de: 'Keine Sorge, unsere Präsentation ist kurz und sehr unterhaltsam!', en: "Don't worry, our presentation is short and great fun!" }, tip: { de: 'Überhört ihren Wunsch: Sie will Fakten, keine Show.', en: 'Ignores her request: she wants facts, not a show.' } },
        ],
      },
      {
        say: { de: 'Unsere Monatsplanung dauert acht Tage. Zu viele Excel-Listen, zu viele Fehler.', en: 'Our monthly planning takes eight days. Too many spreadsheets, too many errors.' },
        mood: 'interested',
        note: { de: 'Die negativen Wörter gelten ihrem Problem, nicht Ihnen: Sie öffnet sich.', en: 'The negative words are about her problem, not about you: she is opening up.' },
        replies: [
          { q: 2, text: { de: 'Acht Tage – wo genau geht dabei die meiste Zeit verloren?', en: 'Eight days – where exactly is most of the time lost?' }, tip: { de: 'Aktiv zugehört und offen nachgefragt.', en: 'Active listening plus an open question.' } },
          { q: 1, text: { de: 'Arbeiten Sie schon lange mit Excel?', en: 'Have you been using spreadsheets for long?' }, tip: { de: 'Geschlossene Frage: Ja oder Nein, wenig Erkenntnis.', en: 'A closed question: yes or no, little insight.' } },
          { q: 0, text: { de: 'Mit unserer Software geht das in einem Tag. Soll ich es zeigen?', en: 'With our software it takes one day. Shall I show you?' }, tip: { de: 'Zu früh verkauft: Der Bedarf ist noch nicht verstanden.', en: "Pitching too early: you don't understand the need yet." } },
        ],
      },
      {
        say: { de: 'Klingt interessant. Was bringt mir das konkret – in Euro?', en: 'Sounds interesting. What does it bring me in concrete terms – in euros?' },
        mood: 'interested',
        replies: [
          { q: 2, text: { de: 'Sie sparen etwa sechs Tage im Monat. Rechnen wir das mit Ihren Stundensätzen durch?', en: 'You save about six days a month. Shall we work it out with your hourly rates?' }, tip: { de: 'Nutzen in ihrer Sprache: Zahlen, die sie selbst prüfen kann.', en: 'Value in her language: numbers she can check herself.' } },
          { q: 1, text: { de: 'Unsere Kunden sparen im Schnitt 30 Prozent Zeit.', en: 'Our customers save 30 per cent of their time on average.' }, tip: { de: 'Eine Zahl, aber nicht auf ihre Lage bezogen.', en: 'A number, but not tied to her situation.' } },
          { q: 0, text: { de: 'Die Software hat über 200 Funktionen und eine KI-Engine.', en: 'The software has more than 200 features and an AI engine.' }, tip: { de: 'Merkmale statt Nutzen – sie fragte nach Euro.', en: 'Features instead of value – she asked about euros.' } },
        ],
      },
      {
        say: { de: 'Schön und gut, aber Ihr Preis liegt 20 Prozent über dem Wettbewerb.', en: 'All well and good, but your price is 20 per cent above the competition.' },
        mood: 'skeptical',
        replies: [
          { q: 2, text: { de: 'Verständlich. Womit vergleichen Sie – nur die Lizenz oder die Gesamtkosten?', en: 'Understandable. What are you comparing – just the licence or the total cost?' }, tip: { de: 'Einwand ernst genommen und mit einer Frage geklärt.', en: 'Takes the objection seriously and clarifies it with a question.' } },
          { q: 1, text: { de: 'Dafür bekommen Sie bei uns den deutlich besseren Support.', en: 'In return you get much better support with us.' }, tip: { de: 'Ein Gegenargument – ohne zu verstehen, was dahintersteckt.', en: 'A counter-argument – without understanding what is behind it.' } },
          { q: 0, text: { de: 'Kein Problem, ich gebe Ihnen sofort 20 Prozent Rabatt.', en: "No problem, I'll give you a 20 per cent discount right now." }, tip: { de: 'Rabatt-Reflex: Sie verschenken Marge und Glaubwürdigkeit.', en: 'Discount reflex: you give away margin and credibility.' } },
        ],
      },
      {
        say: { de: 'Gut. Wenn wir starten würden – wie lange dauert die Einführung?', en: 'Fine. If we went ahead – how long would the rollout take?' },
        mood: 'ready',
        replies: [
          { q: 2, text: { de: 'Sechs Wochen. Sollen wir den Start auf den 1. März legen?', en: 'Six weeks. Shall we set the start for the 1st of March?' }, tip: { de: 'Kaufsignal erkannt und nach dem Abschluss gefragt.', en: 'Buying signal spotted, and you ask for the close.' } },
          { q: 1, text: { de: 'Das hängt von vielem ab. Ich schicke Ihnen Unterlagen.', en: "That depends on many things. I'll send you some documents." }, tip: { de: 'Das Kaufsignal verpufft – kein nächster Schritt.', en: 'The buying signal fizzles out – no next step.' } },
          { q: 0, text: { de: 'Bevor wir dazu kommen: Ich habe noch zwölf Folien für Sie.', en: 'Before we get to that: I have twelve more slides for you.' }, tip: { de: 'Sie redet vom Kaufen – und Sie reden einfach weiter.', en: 'She talks about buying – and you just keep talking.' } },
        ],
      },
    ],
  },
  {
    key: 'demir', type: 'analytical', market: 'B2C',
    name: { de: 'Selim Demir', en: 'Selim Demir' },
    role: { de: 'Hausbesitzer, Ingenieur', en: 'Home owner, engineer' },
    topic: { de: 'will eine Wärmepumpe für sein Haus', en: 'wants a heat pump for his house' },
    look: { suit: 'xr-summit-cloth-mustard', shirt: 'xr-summit-cloth-sky', pants: 'xr-summit-cloth-denim', hair_c: 'xr-summit-hair-black', skin: 'xr-summit-skin-2', accent: 'xr-summit-cloth-teal', iris: 'xr-summit-iris-brown', lips: 'xr-summit-mouth', shoe: 'xr-summit-shoe-brown' },
    steps: [
      {
        say: { de: 'Ich habe mich gründlich informiert. Drei Angebote liegen schon vor mir.', en: "I've done my research. I already have three quotes in front of me." },
        mood: 'reserved',
        replies: [
          { q: 2, text: { de: 'Prima, dann sind Sie gut vorbereitet. Was ist Ihnen beim Vergleich am wichtigsten?', en: "Great, then you're well prepared. What matters most to you when comparing?" }, tip: { de: 'Anerkennung plus offene Frage nach seinen Kriterien.', en: 'Recognition plus an open question about his criteria.' } },
          { q: 1, text: { de: 'Dann zeige ich Ihnen, warum unser Angebot das beste ist.', en: 'Then let me show you why our offer is the best.' }, tip: { de: 'Selbstbewusst, aber Sie kennen seine Kriterien noch nicht.', en: "Confident, but you don't know his criteria yet." } },
          { q: 0, text: { de: 'Die anderen Anbieter sind meistens nicht seriös.', en: "Most of the other suppliers aren't reputable." }, tip: { de: 'Wettbewerber schlechtmachen kostet Vertrauen.', en: 'Badmouthing competitors costs trust.' } },
        ],
      },
      {
        say: { de: 'Mir geht es um die Stromkosten. Und laut darf sie nicht sein, die Nachbarn wohnen nah.', en: "It's about the electricity bill. And it mustn't be loud, the neighbours live close by." },
        mood: 'reserved',
        replies: [
          { q: 2, text: { de: 'Also: niedrige Kosten und leise. Wie hoch ist Ihr Verbrauch heute?', en: 'So: low running costs and quiet. How much do you use today?' }, tip: { de: 'Zusammengefasst, er fühlt sich verstanden – dann offen gefragt.', en: 'Summed up so he feels understood – then an open question.' } },
          { q: 1, text: { de: 'Unsere Geräte sind sehr leise.', en: 'Our units are very quiet.' }, tip: { de: 'Beantwortet einen Punkt, fragt aber nicht weiter.', en: 'Answers one point, but asks nothing further.' } },
          { q: 0, text: { de: 'Laut ist heute keine mehr, das ist kein Thema.', en: "None of them are loud these days, that's not an issue." }, tip: { de: 'Wischt seine Sorge weg, statt sie aufzunehmen.', en: 'Brushes his worry aside instead of picking it up.' } },
        ],
      },
      {
        say: { de: 'Und was spare ich am Ende pro Jahr? Gibt es dazu Messwerte?', en: 'And what do I save per year in the end? Are there measured values?' },
        mood: 'interested',
        replies: [
          { q: 2, text: { de: 'Bei Ihrem Verbrauch rund 900 Euro im Jahr. Hier die Messwerte vom Prüfinstitut.', en: "With your usage about 900 euros a year. Here are the test lab's measurements." }, tip: { de: 'Sein Nutzen in Zahlen, mit Beleg – ideal für Analytiker.', en: 'His benefit in numbers, with proof – ideal for analytical buyers.' } },
          { q: 1, text: { de: 'Sehr viel – unsere Kunden sind alle begeistert.', en: 'A lot – our customers are all delighted.' }, tip: { de: 'Begeisterung ist schön, aber er wollte Zahlen.', en: 'Enthusiasm is nice, but he wanted numbers.' } },
          { q: 0, text: { de: 'Die Pumpe hat einen Inverter-Verdichter mit Zwei-Stufen-Technik.', en: 'The pump has an inverter compressor with two-stage technology.' }, tip: { de: 'Technik-Merkmale statt seiner Ersparnis.', en: 'Technical features instead of his savings.' } },
        ],
      },
      {
        say: { de: 'Na toll. Und in fünf Jahren ist sie dann kaputt, oder was?', en: "Oh great. And in five years it'll be broken, or what?" },
        mood: 'skeptical',
        note: { de: 'Ironie: „Na toll“ klingt positiv, ist aber genervt gemeint. Das hört nur der Mensch.', en: "Irony: 'oh great' sounds positive but is meant sarcastically. Only a human hears that." },
        replies: [
          { q: 2, text: { de: 'Die Sorge verstehe ich. Was würde Ihnen Sicherheit geben – eine längere Garantie?', en: 'I understand that worry. What would make you feel safe – a longer warranty?' }, tip: { de: 'Empathie plus Frage: Der Einwand wird zum Gespräch.', en: 'Empathy plus a question: the objection becomes a conversation.' } },
          { q: 1, text: { de: 'Unsere Geräte gehen eigentlich nie kaputt.', en: 'Our units practically never break down.' }, tip: { de: 'Ein Versprechen, das er nicht prüfen kann.', en: 'A promise he cannot check.' } },
          { q: 0, text: { de: 'Das ist ein Vorurteil, die Technik ist längst ausgereift.', en: "That's a prejudice, the technology matured long ago." }, tip: { de: 'Widerspruch: Er fühlt sich nicht ernst genommen.', en: "Contradiction: he doesn't feel taken seriously." } },
        ],
      },
      {
        say: { de: 'Zehn Jahre Garantie? Dann könnten wir über den Einbau im Frühjahr reden.', en: "Ten years' warranty? Then we could talk about installing it in spring." },
        mood: 'ready',
        replies: [
          { q: 2, text: { de: 'Sehr gern. Passt Ihnen der Einbau eher im April oder im Mai?', en: 'Gladly. Would installation suit you better in April or in May?' }, tip: { de: 'Kaufsignal genutzt: Alternativfrage für den nächsten Schritt.', en: 'Buying signal used: an either-or question for the next step.' } },
          { q: 1, text: { de: 'Überlegen Sie es sich in Ruhe und rufen Sie mich an.', en: 'Take your time to think it over and give me a call.' }, tip: { de: 'Freundlich, aber der Moment geht verloren.', en: 'Friendly, but the moment is lost.' } },
          { q: 0, text: { de: 'Moment, wir haben noch gar nicht über die Smart-Home-App gesprochen.', en: "Wait, we haven't even talked about the smart home app yet." }, tip: { de: 'Er ist bereit – neue Themen bremsen ihn nur.', en: 'He is ready – new topics only slow him down.' } },
        ],
      },
    ],
  },
  {
    key: 'ferri', type: 'relational', market: 'B2B',
    name: { de: 'Marco Ferri', en: 'Marco Ferri' },
    role: { de: 'Inhaber eines Familienrestaurants', en: 'Owner of a family restaurant' },
    topic: { de: 'braucht ein System für Reservierungen', en: 'needs a booking system' },
    look: { suit: 'xr-summit-cloth-white', shirt: 'xr-summit-cloth-white', pants: 'xr-summit-cloth-ink', hair_c: 'xr-summit-hair-black', skin: 'xr-summit-skin-2', accent: 'xr-summit-cloth-wine', iris: 'xr-summit-iris-brown', lips: 'xr-summit-mouth', shoe: 'xr-summit-shoe' },
    steps: [
      {
        say: { de: 'Kommen Sie rein! Einen Kaffee? Mein Team und ich sind seit 25 Jahren hier im Viertel.', en: 'Come in! A coffee? My team and I have been here in the neighbourhood for 25 years.' },
        mood: 'interested',
        replies: [
          { q: 2, text: { de: 'Sehr gern, danke! 25 Jahre – wie hat das damals angefangen?', en: "I'd love one, thanks! 25 years – how did it all start?" }, tip: { de: 'Echtes Interesse an ihm schafft Beziehung.', en: 'Genuine interest in him builds the relationship.' } },
          { q: 1, text: { de: 'Danke, gern. Dann lassen Sie uns gleich loslegen.', en: "Thanks, gladly. Then let's get started right away." }, tip: { de: 'Höflich, aber Sie überspringen, was ihm wichtig ist.', en: 'Polite, but you skip what matters to him.' } },
          { q: 0, text: { de: 'Nein danke, ich habe nur 20 Minuten. Also zur Sache.', en: "No thanks, I only have 20 minutes. So let's get down to business." }, tip: { de: 'Kühl und eilig – bei ihm ein Fehlstart.', en: 'Cool and rushed – a false start with him.' } },
        ],
      },
      {
        say: { de: 'Mein Team ist super. Aber abends am Telefon geht vieles schief, die Gäste ärgern sich.', en: 'My team is great. But in the evenings a lot goes wrong on the phone, and guests get annoyed.' },
        mood: 'interested',
        note: { de: 'Er vertraut Ihnen ein Problem an – das ist Offenheit, keine Ablehnung.', en: 'He confides a problem in you – that is openness, not rejection.' },
        replies: [
          { q: 2, text: { de: 'Das klingt anstrengend. Erzählen Sie: Was passiert an so einem Abend genau?', en: 'That sounds stressful. Tell me: what exactly happens on an evening like that?' }, tip: { de: 'Mitgefühl zeigen und ihn erzählen lassen.', en: 'Show empathy and let him tell the story.' } },
          { q: 1, text: { de: 'Wie viele Reservierungen haben Sie pro Abend?', en: 'How many bookings do you have per evening?' }, tip: { de: 'Sinnvolle Frage, aber sie übergeht seine Sorge.', en: 'A sensible question, but it skips over his worry.' } },
          { q: 0, text: { de: 'Dafür haben wir genau das richtige Produkt!', en: 'We have exactly the right product for that!' }, tip: { de: 'Zu schnell verkauft – er fühlt sich nicht gehört.', en: "Sold too fast – he doesn't feel heard." } },
        ],
      },
      {
        say: { de: 'Und was heißt das für meine Leute? Die sind keine Computer-Profis.', en: "And what does that mean for my people? They're not computer experts." },
        mood: 'skeptical',
        note: { de: 'Klingt wie eine neutrale Frage, ist aber ein leiser Einwand: Er sorgt sich um sein Team.', en: 'Sounds like a neutral question, but it is a quiet objection: he worries about his team.' },
        replies: [
          { q: 2, text: { de: 'Ihr Team telefoniert weniger und hat mehr Zeit für die Gäste. Wir schulen alle persönlich.', en: 'Your team spends less time on the phone and more with the guests. We train everyone personally.' }, tip: { de: 'Nutzen für seine Menschen – und persönliche Begleitung.', en: 'Value for his people – plus personal support.' } },
          { q: 1, text: { de: 'Die Bedienung ist sehr einfach, das lernt jeder schnell.', en: "It's very easy to use, everyone learns it quickly." }, tip: { de: 'Beruhigt, bleibt aber allgemein.', en: 'Reassuring, but generic.' } },
          { q: 0, text: { de: 'Das System hat eine offene Schnittstelle und Cloud-Synchronisation.', en: 'The system has an open interface and cloud sync.' }, tip: { de: 'Fachchinesisch: genau das, wovor er Sorge hat.', en: 'Tech jargon: exactly what he is worried about.' } },
        ],
      },
      {
        say: { de: 'Ehrlich gesagt: Mein Neffe meint, so etwas kann er auch selbst bauen.', en: 'To be honest: my nephew says he could build something like that himself.' },
        mood: 'skeptical',
        note: { de: 'Höflich verpackter Zweifel: Er testet, ob Sie seine Familie respektieren.', en: 'Doubt wrapped in politeness: he is testing whether you respect his family.' },
        replies: [
          { q: 2, text: { de: 'Schön, dass er Sie unterstützt! Was wäre Ihnen wichtig, wenn abends mal etwas ausfällt?', en: 'Nice that he supports you! What would matter to you if something fails one evening?' }, tip: { de: 'Die Beziehung respektiert und nach dem Risiko gefragt.', en: 'Respects the relationship and asks about the risk.' } },
          { q: 1, text: { de: 'Das geht schon, kostet aber viel Zeit.', en: "That's possible, but it takes a lot of time." }, tip: { de: 'Sachlich richtig, aber ein Argument gegen seinen Neffen.', en: 'Factually right, but an argument against his nephew.' } },
          { q: 0, text: { de: 'Mit Verlaub, das schafft Ihr Neffe sicher nicht.', en: "With respect, your nephew certainly can't manage that." }, tip: { de: 'Angriff auf die Familie – das Vertrauen ist weg.', en: 'An attack on his family – the trust is gone.' } },
        ],
      },
      {
        say: { de: 'Wissen Sie was? Sie sind mir sympathisch. Wie geht es jetzt weiter?', en: 'You know what? I like you. So what happens next?' },
        mood: 'ready',
        replies: [
          { q: 2, text: { de: 'Das freut mich! Wir richten es mit Ihrem Team ein – passt Ihnen Dienstag?', en: "Glad to hear it! We'll set it up with your team – does Tuesday work?" }, tip: { de: 'Kaufsignal: konkreter nächster Schritt, mit seinem Team.', en: 'Buying signal: a concrete next step, with his team.' } },
          { q: 1, text: { de: 'Ich schicke Ihnen ein Angebot, dann sehen wir weiter.', en: "I'll send you a quote, then we'll see." }, tip: { de: 'Unverbindlich – der Schwung geht verloren.', en: 'Non-committal – the momentum is lost.' } },
          { q: 0, text: { de: 'Lassen Sie mich vorher noch alle Funktionen zeigen.', en: 'Let me show you all the features first.' }, tip: { de: 'Er will weiter – Sie halten ihn mit Details auf.', en: 'He wants to move on – you hold him up with details.' } },
        ],
      },
    ],
  },
  {
    key: 'wagner', type: 'relational', market: 'B2C',
    name: { de: 'Ingrid Wagner', en: 'Ingrid Wagner' },
    role: { de: 'Großmutter, plant mit Ehemann Paul', en: 'Grandmother, planning with her husband Paul' },
    topic: { de: 'plant eine neue Küche', en: 'is planning a new kitchen' },
    look: { suit: 'xr-summit-cloth-rose', shirt: 'xr-summit-cloth-white', pants: 'xr-summit-cloth-plum', hair_c: 'xr-summit-hair-silver', skin: 'xr-summit-skin-1', accent: 'xr-summit-cloth-teal', iris: 'xr-summit-iris-blue', lips: 'xr-summit-lips-rose', shoe: 'xr-summit-shoe' },
    steps: [
      {
        say: { de: 'Schön, dass Sie da sind! Unsere Nachbarn haben Sie empfohlen.', en: "How nice that you're here! Our neighbours recommended you." },
        mood: 'interested',
        replies: [
          { q: 2, text: { de: 'Das freut mich! Was haben Ihnen die Nachbarn denn erzählt?', en: "I'm delighted! What did your neighbours tell you?" }, tip: { de: 'An die Empfehlung anknüpfen – und sie erzählen lassen.', en: 'Builds on the recommendation – and lets her talk.' } },
          { q: 1, text: { de: 'Danke. Dann nehmen wir gleich die Maße Ihrer Küche.', en: "Thanks. Then let's measure your kitchen right away." }, tip: { de: 'Freundlich, aber gleich sachlich – die Beziehung kommt zu kurz.', en: 'Friendly, but straight to business – the relationship falls short.' } },
          { q: 0, text: { de: 'Empfehlungen bekommen wir oft. Hier ist unser Katalog.', en: "We get recommendations all the time. Here's our catalogue." }, tip: { de: 'Wirkt überheblich – und nimmt ihr die Freude.', en: 'Comes across as arrogant – and spoils her joy.' } },
        ],
      },
      {
        say: { de: 'Bei uns kocht die ganze Familie, sonntags auch die Enkel. Jetzt ist es einfach zu eng.', en: "The whole family cooks at our place, the grandchildren too on Sundays. Now it's just too cramped." },
        mood: 'interested',
        note: { de: 'Sie erzählt gern von ihrer Familie – „zu eng“ ist ihr Wunsch, kein Ärger.', en: "She loves talking about her family – 'too cramped' is her wish, not annoyance." },
        replies: [
          { q: 2, text: { de: 'Wie schön, alle zusammen! Wie läuft so ein Kochsonntag bei Ihnen ab?', en: 'How lovely, everyone together! What does a cooking Sunday look like at your place?' }, tip: { de: 'Warm und offen gefragt – so erfahren Sie ihre echten Wünsche.', en: "Warm and open – that's how you learn her real wishes." } },
          { q: 1, text: { de: 'Wie viele Quadratmeter hat Ihre Küche?', en: 'How many square metres is your kitchen?' }, tip: { de: 'Nötig, aber zu früh und zu nüchtern.', en: 'Necessary, but too early and too dry.' } },
          { q: 0, text: { de: 'Dann nehmen Sie am besten unser Modell in Größe XL.', en: 'Then our model in size XL is your best bet.' }, tip: { de: 'Lösung ohne Verständnis – sie fühlt sich nicht gehört.', en: "A solution without understanding – she doesn't feel heard." } },
        ],
      },
      {
        say: { de: 'Und wird das dann wirklich gemütlich? Wir wollen uns wohlfühlen.', en: 'And will it really be cosy? We want to feel at home.' },
        mood: 'interested',
        replies: [
          { q: 2, text: { de: 'Ja: An der Kochinsel stehen alle zusammen, und Sie sehen die Enkel am Tisch.', en: 'Yes: everyone stands together at the island, and you can see the grandchildren at the table.' }, tip: { de: 'Der Nutzen als Bild ihres Familienlebens.', en: 'Value painted as a picture of her family life.' } },
          { q: 1, text: { de: 'Die Fronten gibt es in 40 warmen Farben.', en: 'The fronts come in 40 warm colours.' }, tip: { de: 'Ein Merkmal – nett, aber nicht ihr Gefühl.', en: 'A feature – nice, but not her feeling.' } },
          { q: 0, text: { de: 'Die Arbeitsplatte ist 38 Millimeter stark und kratzfest.', en: 'The worktop is 38 millimetres thick and scratch-proof.' }, tip: { de: 'Technische Daten statt Wohlgefühl.', en: 'Technical data instead of comfort.' } },
        ],
      },
      {
        say: { de: 'Hm. Ich weiß nicht ... das ist schon sehr viel Geld für uns.', en: "Hmm. I don't know ... that's a lot of money for us." },
        mood: 'skeptical',
        replies: [
          { q: 2, text: { de: 'Das verstehe ich. Welcher Rahmen passt für Sie? Wir schauen gemeinsam, was geht.', en: "I understand. What budget suits you? Let's look together at what's possible." }, tip: { de: 'Verständnis zeigen und gemeinsam eine Lösung suchen.', en: 'Show understanding and look for a solution together.' } },
          { q: 1, text: { de: 'Gute Qualität hat eben ihren Preis.', en: 'Good quality comes at a price.' }, tip: { de: 'Stimmt – aber es rechtfertigt, statt zu verstehen.', en: 'True – but it justifies instead of understanding.' } },
          { q: 0, text: { de: 'Das Angebot gilt aber nur noch heute!', en: 'But this offer is only valid today!' }, tip: { de: 'Druck zerstört Vertrauen – gerade bei ihr.', en: 'Pressure destroys trust – especially with her.' } },
        ],
      },
      {
        say: { de: 'Paul, was meinst du? ... Ja, uns gefällt das wirklich sehr.', en: 'Paul, what do you think? ... Yes, we really like it.' },
        mood: 'ready',
        note: { de: 'Das Paar ist sich einig – ein klares Kaufsignal, auch ohne Wörter wie „kaufen“.', en: "The couple agree – a clear buying signal, even without words like 'buy'." },
        replies: [
          { q: 2, text: { de: 'Das freut mich! Sollen wir den Termin zum Ausmessen gleich festmachen?', en: 'Wonderful! Shall we fix the measuring appointment right now?' }, tip: { de: 'Kaufsignal: Jetzt den nächsten Schritt vereinbaren.', en: 'Buying signal: agree on the next step now.' } },
          { q: 1, text: { de: 'Schön. Nehmen Sie den Katalog doch erst einmal mit nach Hause.', en: 'Lovely. Why not take the catalogue home first.' }, tip: { de: 'Nett gemeint, aber Sie verschenken den Moment.', en: 'Kindly meant, but you waste the moment.' } },
          { q: 0, text: { de: 'Dann zeige ich Ihnen noch unsere Premium-Geräte.', en: 'Then let me show you our premium appliances too.' }, tip: { de: 'Mehr verkaufen im falschen Moment – sie zögert wieder.', en: 'Upselling at the wrong moment – she hesitates again.' } },
        ],
      },
    ],
  },
  {
    key: 'petrov', type: 'decisive', market: 'B2B',
    name: { de: 'Jana Petrov', en: 'Jana Petrov' },
    role: { de: 'Geschäftsführerin einer Spedition', en: 'Managing director of a haulage firm' },
    topic: { de: 'will weniger Leerfahrten', en: 'wants fewer empty truck runs' },
    look: { suit: 'xr-summit-cloth-ink', shirt: 'xr-summit-cloth-white', pants: 'xr-summit-cloth-ink', hair_c: 'xr-summit-hair-blond', skin: 'xr-summit-skin-1', accent: 'xr-summit-cloth-wine', iris: 'xr-summit-iris-blue', lips: 'xr-summit-lips-red', shoe: 'xr-summit-shoe-red' },
    steps: [
      {
        say: { de: 'Ich habe zehn Minuten. Was haben Sie für mich?', en: 'I have ten minutes. What have you got for me?' },
        mood: 'reserved',
        replies: [
          { q: 2, text: { de: 'Danke für die Zeit. Kurz: Wir senken Leerfahrten. Darf ich zwei Fragen stellen?', en: 'Thanks for your time. In short: we cut empty runs. May I ask two questions?' }, tip: { de: 'Knapp, das Ergebnis vorneweg – und dann fragen.', en: 'Brief, result first – then ask.' } },
          { q: 1, text: { de: 'Wir sind einer der führenden Anbieter für Routenplanung.', en: 'We are one of the leading providers of route planning.' }, tip: { de: 'Kurz, aber es geht um Sie statt um ihren Nutzen.', en: "Short, but it's about you, not her benefit." } },
          { q: 0, text: { de: 'Wie war Ihre Woche? Schönes Wetter heute, oder?', en: "How was your week? Lovely weather today, isn't it?" }, tip: { de: 'Smalltalk bei einer Entscheiderin mit zehn Minuten.', en: 'Small talk with a decision-maker who has ten minutes.' } },
        ],
      },
      {
        say: { de: 'Unsere Lkw fahren 18 Prozent leer. Das kostet. Lösen Sie das schnell.', en: 'Our trucks run empty 18 per cent of the time. That costs money. Fix it fast.' },
        mood: 'interested',
        note: { de: 'Ungeduldig, aber offen: Sie will eine Lösung – das ist kein Nein.', en: "Impatient but open: she wants a solution – that's not a no." },
        replies: [
          { q: 2, text: { de: 'Wo entstehen die Leerfahrten vor allem – auf dem Rückweg?', en: 'Where do the empty runs mainly happen – on the way back?' }, tip: { de: 'Eine gezielte Frage, die direkt zur Lösung führt.', en: 'One targeted question that leads straight to the solution.' } },
          { q: 1, text: { de: 'Haben Sie schon andere Lösungen ausprobiert?', en: 'Have you tried other solutions already?' }, tip: { de: 'Geschlossen gefragt – bringt sie kaum weiter.', en: "A closed question – doesn't move her forward much." } },
          { q: 0, text: { de: 'Planen wir doch erst einen Workshop mit allen Abteilungen.', en: "Let's first plan a workshop with all departments." }, tip: { de: 'Viel zu langsam für eine Entscheiderin.', en: 'Far too slow for a decision-maker.' } },
        ],
      },
      {
        say: { de: 'Rückfahrten, ja. Was ist das Ergebnis? Kurz, bitte.', en: "Return trips, yes. What's the result? Briefly, please." },
        mood: 'reserved',
        replies: [
          { q: 2, text: { de: 'Halb so viele leere Rückfahrten. Das sind rund 9 Prozent weniger Kosten.', en: "Half as many empty return trips. That's about 9 per cent lower costs." }, tip: { de: 'Ergebnis zuerst, in einem Satz – genau ihr Stil.', en: 'Result first, in one sentence – exactly her style.' } },
          { q: 1, text: { de: 'Unser Algorithmus berechnet in Echtzeit die optimale Route.', en: 'Our algorithm calculates the optimal route in real time.' }, tip: { de: 'Wie es funktioniert, nicht was es ihr bringt.', en: 'How it works, not what it does for her.' } },
          { q: 0, text: { de: 'Darf ich Ihnen dazu unser 40-seitiges Whitepaper schicken?', en: 'May I send you our 40-page white paper on this?' }, tip: { de: 'Sie bat um „kurz“ – 40 Seiten sind das Gegenteil.', en: "She asked for 'brief' – 40 pages is the opposite." } },
        ],
      },
      {
        say: { de: 'Für ein langes IT-Projekt habe ich keine Zeit.', en: "I don't have time for a long IT project." },
        mood: 'skeptical',
        replies: [
          { q: 2, text: { de: 'Verstehe. Wäre ein Pilot mit zehn Lkw ein schneller Start für Sie?', en: 'Understood. Would a pilot with ten trucks be a quick start for you?' }, tip: { de: 'Einwand aufgenommen und als Frage eine kleine Lösung angeboten.', en: 'Picks up the objection and offers a small solution as a question.' } },
          { q: 1, text: { de: 'So aufwendig ist die Einführung eigentlich gar nicht.', en: "The rollout isn't really that much work." }, tip: { de: 'Verharmlost ihre Sorge, statt sie zu lösen.', en: 'Plays down her concern instead of solving it.' } },
          { q: 0, text: { de: 'Ohne gründliches Projekt geht es leider nicht.', en: "Unfortunately it doesn't work without a thorough project." }, tip: { de: 'Unflexibel – damit ist das Gespräch zu Ende.', en: 'Inflexible – that ends the conversation.' } },
        ],
      },
      {
        say: { de: 'Zehn Lkw, vier Wochen. Was kostet der Pilot?', en: 'Ten trucks, four weeks. How much is the pilot?' },
        mood: 'ready',
        replies: [
          { q: 2, text: { de: '4.800 Euro. Wenn Sie zustimmen, starten wir am Montag. Einverstanden?', en: '4,800 euros. If you agree, we start on Monday. Deal?' }, tip: { de: 'Preis klar genannt und direkt nach dem Ja gefragt.', en: 'Clear price, then you ask straight for the yes.' } },
          { q: 1, text: { de: 'Das kläre ich intern und melde mich nächste Woche.', en: "I'll check internally and get back to you next week." }, tip: { de: 'Zu langsam – sie hätte heute entschieden.', en: 'Too slow – she would have decided today.' } },
          { q: 0, text: { de: 'Bevor wir über Geld reden: Kennen Sie schon unsere Zusatzmodule?', en: 'Before we talk money: do you know our add-on modules?' }, tip: { de: 'Ablenkung im Moment der Entscheidung.', en: 'A distraction at the moment of decision.' } },
        ],
      },
    ],
  },
  {
    key: 'olsen', type: 'decisive', market: 'B2C',
    name: { de: 'Sven Olsen', en: 'Sven Olsen' },
    role: { de: 'Pendler, Vertriebsleiter', en: 'Commuter, sales manager' },
    topic: { de: 'will ein Elektroauto leasen', en: 'wants to lease an electric car' },
    look: { suit: 'xr-summit-cloth-slate', shirt: 'xr-summit-cloth-sky', pants: 'xr-summit-cloth-slate', hair_c: 'xr-summit-hair-red', skin: 'xr-summit-skin-3', accent: 'xr-summit-cloth-wine', iris: 'xr-summit-iris-green', lips: 'xr-summit-mouth', shoe: 'xr-summit-shoe-brown' },
    steps: [
      {
        say: { de: 'Hi. Ich will heute noch ein E-Auto leasen. Was geht?', en: 'Hi. I want to lease an electric car today. What can you do?' },
        mood: 'interested',
        note: { de: '„Heute“ klingt nach Abschluss – aber erst müssen Sie wissen, was er braucht.', en: "'Today' sounds like a close – but first you need to know what he needs." },
        replies: [
          { q: 2, text: { de: 'Super, dann legen wir los. Wofür nutzen Sie das Auto vor allem?', en: "Great, let's get going. What will you mainly use the car for?" }, tip: { de: 'Sein Tempo aufgenommen und die wichtigste Frage gestellt.', en: 'Matches his pace and asks the key question.' } },
          { q: 1, text: { de: 'Willkommen! Darf ich Ihnen erst einmal einen Kaffee anbieten?', en: 'Welcome! May I offer you a coffee first?' }, tip: { de: 'Freundlich, aber er will Tempo.', en: 'Friendly, but he wants speed.' } },
          { q: 0, text: { de: 'Schauen Sie sich ruhig erst einmal in Ruhe um.', en: 'Feel free to have a look around first.' }, tip: { de: 'Passiv – er wollte heute entscheiden.', en: 'Passive – he wanted to decide today.' } },
        ],
      },
      {
        say: { de: 'Pendeln, 80 Kilometer am Tag. Am Wochenende auch mal 400 zur Familie.', en: 'Commuting, 80 kilometres a day. At weekends sometimes 400 to see family.' },
        mood: 'reserved',
        replies: [
          { q: 2, text: { de: 'Also täglich 80 und manchmal 400 am Stück. Wo können Sie laden?', en: 'So 80 a day and sometimes 400 in one go. Where can you charge?' }, tip: { de: 'Kurz zusammengefasst und die entscheidende Frage gestellt.', en: 'A short summary and the decisive question.' } },
          { q: 1, text: { de: 'Wie viel möchten Sie im Monat ausgeben?', en: 'How much do you want to spend per month?' }, tip: { de: 'Relevant, aber erst nach dem Bedarf.', en: 'Relevant, but only after the need.' } },
          { q: 0, text: { de: 'Welche Farbe hätten Sie denn gern?', en: 'Which colour would you like?' }, tip: { de: 'Nebensache – der Bedarf ist noch offen.', en: 'A side issue – the need is still open.' } },
        ],
      },
      {
        say: { de: 'Okay. Welches Modell und warum? In einem Satz.', en: 'Okay. Which model and why? In one sentence.' },
        mood: 'reserved',
        replies: [
          { q: 2, text: { de: 'Modell M: 450 km Reichweite, also ohne Ladestopp zur Familie – für 399 Euro im Monat.', en: 'Model M: 450 km range, so no charging stop on the way to your family – 399 euros a month.' }, tip: { de: 'Ein Satz: sein Bedarf, sein Nutzen, der Preis.', en: 'One sentence: his need, his benefit, the price.' } },
          { q: 1, text: { de: 'Modell M hat 450 km Reichweite und einen 22-kW-Lader.', en: 'Model M has a 450 km range and a 22 kW charger.' }, tip: { de: 'Kurz, aber nur Merkmale ohne seinen Nutzen.', en: 'Short, but only features, not his benefit.' } },
          { q: 0, text: { de: 'Ich zeige Ihnen am besten alle drei Modelle ausführlich.', en: "I'd better show you all three models in detail." }, tip: { de: 'Er wollte einen Satz – nicht drei Präsentationen.', en: 'He wanted one sentence – not three presentations.' } },
        ],
      },
      {
        say: { de: '399 Euro? Online habe ich ihn für 369 gesehen.', en: '399 euros? I saw it online for 369.' },
        mood: 'skeptical',
        replies: [
          { q: 2, text: { de: 'Gut recherchiert! Was ist bei dem Online-Angebot drin – Wartung, Versicherung?', en: "Good research! What's included in the online offer – servicing, insurance?" }, tip: { de: 'Anerkennen und mit einer Frage den Vergleich klären.', en: 'Acknowledge it and clarify the comparison with a question.' } },
          { q: 1, text: { de: 'Online sind oft Lockangebote dabei.', en: 'Online there are often bait offers.' }, tip: { de: 'Möglich, aber es klingt nach Ausrede.', en: 'Possible, but it sounds like an excuse.' } },
          { q: 0, text: { de: 'Okay, dann bekommen Sie ihn auch für 369.', en: 'Okay, then you can have it for 369 too.' }, tip: { de: 'Sofort nachgegeben: Ihr Preis war wohl nicht ernst gemeint.', en: "Giving in at once: your price apparently wasn't serious." } },
        ],
      },
      {
        say: { de: 'Wartung inklusive? ... Wann könnte ich ihn abholen?', en: 'Servicing included? ... When could I pick it up?' },
        mood: 'ready',
        replies: [
          { q: 2, text: { de: 'Ja, Wartung ist drin. Abholung am Freitag – soll ich den Vertrag fertig machen?', en: 'Yes, servicing is included. Pick-up on Friday – shall I prepare the contract?' }, tip: { de: 'Kaufsignal: Frage beantwortet und den Abschluss angeboten.', en: 'Buying signal: question answered and the close offered.' } },
          { q: 1, text: { de: 'Das muss ich erst mit dem Lager klären.', en: "I'll have to check with the warehouse first." }, tip: { de: 'Der Schwung bricht ab.', en: 'The momentum breaks off.' } },
          { q: 0, text: { de: 'Lassen Sie uns vorher noch über Zusatzpakete sprechen.', en: "Let's talk about add-on packages first." }, tip: { de: 'Er will abschließen – Sie lenken ab.', en: 'He wants to sign – you distract him.' } },
        ],
      },
    ],
  },
];
