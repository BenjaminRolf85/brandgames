// Echo Parkour: the course (in level units, 1 unit = one block) and what every coin tells
// about Echomotion. Texts only state what echomotion.ai says about itself.

/** One fact per coin, in course order. */
export const COIN_FACTS = [
  {
    title: { de: 'KI-Agenten', en: 'AI agents' },
    text: { de: 'Echomotion baut KI-Agenten: virtuelle Mitarbeiter, die echte Arbeit erledigen. Gebaut, integriert und betrieben.', en: 'Echomotion builds AI agents: virtual team members that do real work. Built, integrated and operated.' },
  },
  {
    title: { de: 'Mitten im Team', en: 'Right in the team' },
    text: { de: 'Die Agenten arbeiten proaktiv mit, per E-Mail, WhatsApp, Audio und Kalender.', en: 'The agents work along proactively, via email, WhatsApp, audio and calendar.' },
  },
  {
    title: { de: 'Schnell startklar', en: 'Ready fast' },
    text: { de: 'Ein erster KI-Agent ist in 1 bis 2 Wochen einsatzbereit, Setups mit mehreren Agenten in 4 bis 6 Wochen.', en: 'A first AI agent is ready in 1 to 2 weeks, setups with several agents in 4 to 6 weeks.' },
  },
  {
    title: { de: 'KI-Beratung', en: 'AI consulting' },
    text: { de: 'Strategie, Potenzialanalyse und Roadmap für KMU und Mittelstand: in 4 Wochen von der Analyse zur fertigen KI-Roadmap.', en: 'Strategy, potential analysis and roadmap for SMEs: from analysis to a finished AI roadmap in 4 weeks.' },
  },
  {
    title: { de: 'Kostenloser Start', en: 'Free start' },
    text: { de: 'Zum Einstieg gibt es eine kostenlose Potenzialanalyse: 30 Minuten, kein Pitch.', en: 'To get started there is a free potential analysis: 30 minutes, no pitch.' },
  },
  {
    title: { de: 'KI-Training', en: 'AI training' },
    text: { de: 'Praxisnahe Trainings für Geschäftsführung, Teamleitungen und Mitarbeitende, ganz ohne technisches Vorwissen.', en: 'Hands-on trainings for management, team leads and staff, no technical background needed.' },
  },
  {
    title: { de: 'Bis zur Eigenständigkeit', en: 'Until you fly solo' },
    text: { de: 'Strategie-Workshop, Integration, Hands-on-Training und laufender Support: remote, hybrid oder vor Ort in München.', en: 'Strategy workshop, integration, hands-on training and ongoing support: remote, hybrid or on site in Munich.' },
  },
  {
    title: { de: 'KI-Hackathons', en: 'AI hackathons' },
    text: { de: 'In zwei Tagen vom Problem zum funktionierenden Prototyp, mit 5 bis 15 Leuten und echtem Code statt PowerPoint.', en: 'From problem to working prototype in two days, with 5 to 15 people and real code instead of slides.' },
  },
  {
    title: { de: 'Entwicklung und Umsetzung', en: 'Development and rollout' },
    text: { de: 'Individuelle KI-Systeme und Automationen, vom Pilot bis zum produktiven Betrieb.', en: 'Custom AI systems and automations, from pilot to production.' },
  },
  {
    title: { de: 'Eigene Produkte', en: 'Own products' },
    text: { de: 'Der AI Agent Workspace und die AI Training Plattform mit interaktiven KI-Kursen, auch zum EU AI Act.', en: 'The AI Agent Workspace and the AI Training Platform with interactive AI courses, also on the EU AI Act.' },
  },
  {
    title: { de: 'Datenschutz', en: 'Data protection' },
    text: { de: 'DSGVO-konform: Datenbank in Deutschland, kein Training mit deinen Daten.', en: 'GDPR compliant: database in Germany, no training on your data.' },
  },
  {
    title: { de: 'Made in München', en: 'Made in Munich' },
    text: { de: 'Sitz in München, Team in München, Berlin, Bonn und New York. Das Motto: Nicht reden. Machen.', en: 'Based in Munich, team in Munich, Berlin, Bonn and New York. The motto: less talk, more action.' },
  },
];

/**
 * Builds the course. Units: x to the right, y up, the start ground at y = 0.
 * cols: blocks one unit wide { x, top, bottom, zone } · lifts: moving platforms
 * coins: { x, y } · spikes: { x0, x1, y } · bugs: { x, y, amp, period }
 * checkpoints: x positions · finish: x of the goal gate
 */
export const FOREST_CEIL = 6.2; // underside of the forest's leaf canopy
export const CITY_CEIL = 7.0; // underside of the city's low cloud deck

export function buildCourse() {
  const c = { cols: [], lifts: [], coins: [], spikes: [], bugs: [], checkpoints: [], finish: 200, start: 2 };
  const zoneOf = (x) => (x < 62 ? 0 : x < 132 ? 1 : 2);
  const ground = (x0, x1, top = 0) => { for (let x = x0; x < x1; x++) c.cols.push({ x, top, bottom: -2.5, zone: zoneOf(x) }); };
  const float = (x0, x1, top) => { for (let x = x0; x < x1; x++) c.cols.push({ x, top, bottom: top - 0.6, zone: zoneOf(x) }); };
  const coin = (x, y) => c.coins.push({ x, y });

  // Zone 1: running and jumping
  ground(-4, 14);
  coin(7, 1.2); // on the way: the first one comes by itself
  ground(16, 21);
  ground(21, 23, 1); // a step up
  coin(22, 2.4);
  ground(23, 30);
  ground(33, 46);
  coin(39.5, 3.0); // jump for it
  c.checkpoints.push(47);
  ground(46, 50);
  ground(50, 51, 1);
  ground(51, 55);
  ground(55, 57, 1);
  coin(53, 1.2);
  ground(57, 62);

  // Zone 2: wings (a second press in the air flaps)
  coin(64, 3.4); // over the wide gap
  ground(66, 74);
  float(75, 79, 1.5);
  float(82, 86, 2.5);
  coin(84, 4.6);
  float(89, 93, 1.5);
  ground(95, 106);
  c.checkpoints.push(97);
  // A lift in a pit, right next to a high ledge: ride it up (or jump onto it).
  c.lifts.push({ x0: 106, x1: 109, base: 1.15, amp: 1.65, period: 3.2 });
  coin(107.5, 5.2);
  ground(109, 122, 2.5);
  coin(116, 3.7);
  ground(122, 132);

  // Zone 3: glitches and bugs
  c.checkpoints.push(133);
  ground(132, 160);
  // Glitch rows are short (1 to 1.5 blocks), so one well-timed jump clears them.
  c.spikes.push({ x0: 137, x1: 138, y: 0 }, { x0: 145, x1: 146.5, y: 0 }, { x0: 152, x1: 153, y: 0 });
  coin(141.5, 1.2);
  coin(149.5, 3.1);
  // Bugs fly up and down: run underneath while they are up, jump over them while they are down.
  c.bugs.push({ x: 157, y: 2.2, amp: 1.0, period: 2.2 });
  ground(164, 180);
  c.checkpoints.push(166);
  c.bugs.push({ x: 171, y: 2.4, amp: 1.2, period: 2.6 }, { x: 177, y: 1.2, amp: 0.9, period: 1.8 });
  coin(174, 1.3);
  ground(180, 183, 1);
  ground(183, 186, 2);
  ground(186, 190, 3);
  coin(188, 5.0);
  ground(190, 207);
  c.checkpoints.push(192);
  c.cols.sort((a, b) => a.x - b.x);
  c.solids = c.cols.map((col) => ({ x0: col.x, x1: col.x + 1, top: col.top, bottom: col.bottom }));

  // Flying (every press is a wing beat): a leaf canopy is the ceiling, branches hang down from
  // it and must be flown under, thorns under some of them and eagles patrolling the upper air
  // make flying high risky. Every passage leaves about 2.7 units of room (Echo is 0.95 tall and
  // rises about 1.7 per wing beat), counted from glitches, thorns and eagles where there are any.
  c.ceiling = FOREST_CEIL;
  c.branches = [
    [12, 15, 3.4], [26, 29, 3.4], [44, 47, 3.4], [58, 61, 3.4],
    [69, 72, 3.4], [77, 79, 4.5], [91, 94, 4.5], [99, 102, 3.4], [118, 121, 5.3], [126, 129, 3.4],
    [136, 139, 4.4, true], [145, 147, 4.4, true], [152, 155, 3.8], [166, 169, 4.0, true], [176, 179, 4.3], [195, 198, 3.4],
  ].map(([x0, x1, y, thorns]) => ({ x0, x1, y, thorns: !!thorns }));
  c.thorns = c.branches.filter((b) => b.thorns).map((b) => ({ x0: b.x0, x1: b.x1, y: b.y }));
  // Eagles patrol between the branches; the high coins at 107.5 and 188 need good timing.
  // They keep to the upper air (5.2 and higher): the middle lane stays free, flying high is risky.
  c.eagles = [
    { x0: 16, x1: 25, y: 5.5, period: 5.0 }, { x0: 30, x1: 43, y: 5.5, period: 6.0 },
    { x0: 86, x1: 93, y: 5.5, period: 4.6 }, { x0: 103, x1: 117, y: 5.7, period: 6.0 },
    { x0: 158, x1: 166, y: 5.5, period: 4.4 }, { x0: 180, x1: 194, y: 5.6, period: 6.0 },
  ];
  c.solids.push({ x0: -10, x1: 220, bottom: c.ceiling, top: c.ceiling + 2 });
  for (const b of c.branches) c.solids.push({ x0: b.x0, x1: b.x1, bottom: b.y, top: c.ceiling });
  return c;
}


// =====================================================================================
// Level 3: a day at the office. Echo flies (every press is a wing beat) from the morning
// to the evening. Coins: an agent's working day (HAILY, an example agent on echomotion.ai)
// plus more of what Echomotion does; texts only state what echomotion.ai says.
// =====================================================================================

export const OFFICE_FACTS = [
  {
    title: { de: '07:00 Morgenbericht', en: '7:00 Morning report' },
    text: { de: 'Ein KI-Agent wie HAILY, ein Beispiel von Echomotion, liefert um 7 Uhr den Morgenbericht.', en: 'An AI agent like HAILY, an example by Echomotion, delivers the morning report at 7 am.' },
  },
  {
    title: { de: 'Schlüsselfertig', en: 'Turnkey' },
    text: { de: 'Echomotion richtet die Agenten schlüsselfertig ein. Hosting, Wartung und Support sind im Preis enthalten.', en: 'Echomotion sets up the agents turnkey. Hosting, maintenance and support are included in the price.' },
  },
  {
    title: { de: '08:30 Meeting-Briefing', en: '8:30 Meeting briefing' },
    text: { de: 'Vor dem Termin um 8:30 Uhr kommt das Briefing als Audio.', en: 'Before the 8:30 meeting the briefing arrives as audio.' },
  },
  {
    title: { de: 'Kein Vendor Lock-in', en: 'No vendor lock-in' },
    text: { de: 'Echomotion dokumentiert alles und schult dein Team, damit du unabhängig bleibst.', en: 'Echomotion documents everything and trains your team, so you stay independent.' },
  },
  {
    title: { de: 'Claire', en: 'Claire' },
    text: { de: 'Claire ist ein Produkt von Echomotion für Marketing und Werbung: Kampagnen für Google, Meta und GPT Ads.', en: 'Claire is an Echomotion product for marketing and advertising: campaigns for Google, Meta and GPT Ads.' },
  },
  {
    title: { de: '12:00 Tageszusammenfassung', en: '12:00 Day summary' },
    text: { de: 'Um 12 Uhr kommt die Tageszusammenfassung per WhatsApp.', en: 'At noon the day summary arrives via WhatsApp.' },
  },
  {
    title: { de: 'Google-Profile im Griff', en: 'Google profiles handled' },
    text: { de: 'Der Google Business Profile Agent pflegt Google-Profile, beantwortet Bewertungen und kümmert sich um Local SEO.', en: 'The Google Business Profile Agent maintains Google profiles, answers reviews and takes care of local SEO.' },
  },
  {
    title: { de: '14:00 Follow-ups', en: '14:00 Follow-ups' },
    text: { de: 'Um 14 Uhr plant der Agent die Follow-ups direkt im Kalender.', en: 'At 2 pm the agent plans the follow-ups right in the calendar.' },
  },
  {
    title: { de: 'Nur EU-Rechenzentren', en: 'EU data centres only' },
    text: { de: 'Auf Wunsch läuft die Textgenerierung ausschließlich in EU-Rechenzentren.', en: 'On request, text generation runs in EU data centres only.' },
  },
  {
    title: { de: 'Branchen', en: 'Industries' },
    text: { de: 'Echomotion arbeitet für Mittelstand, Automotive, Manufacturing, Finanzbranche, E-Commerce und Retail.', en: 'Echomotion works for SMEs, automotive, manufacturing, finance, e-commerce and retail.' },
  },
  {
    title: { de: '50+ KI-Projekte', en: '50+ AI projects' },
    text: { de: 'Mehr als 50 KI-Projekte hat Echomotion schon umgesetzt.', en: 'Echomotion has already delivered more than 50 AI projects.' },
  },
  {
    title: { de: '18:00 Tagesabschluss', en: '18:00 Day close' },
    text: { de: 'Um 18 Uhr schickt der Agent den Tagesabschluss per E-Mail. Feierabend!', en: 'At 6 pm the agent sends the day close by email. Time to head home!' },
  },
];

export const OFFICE_CEIL = 6.4;

/**
 * Office furniture: collision boxes relative to the prop's x [x0, x1, y0, y1] (y from its base).
 * Ceiling parts (duct, lamp) take their length from the course entry.
 */
const PROPS = {
  desk: [[-1.1, 1.1, 0, 1.44], [-0.65, 0.45, 1.44, 2.34]],
  chair: [[-0.36, 0.36, 0, 1.56]],
  cabinet: [[-0.5, 0.5, 0, 2.2]],
  shelf: [[-0.7, 0.7, 0, 2.6]],
  plant: [[-0.4, 0.4, 0, 1.8]],
  partition: [[-0.14, 0.14, 0, 3.04]],
  counter: [[-1.5, 1.5, 0, 1.5]],
  coffee: [[-0.4, 0.4, 0, 1.1]],
  fridge: [[-0.6, 0.6, 0, 3.4]],
  table: [[-3, 3, 0, 1.31]],
  whiteboard: [[-1.25, 1.25, 0, 3.0]],
  printer: [[-0.7, 0.7, 0, 1.21]],
  transom: [[-0.1, 0.1, 3.4, OFFICE_CEIL - 0.0001]],
};

export function buildOfficeCourse() {
  const C = OFFICE_CEIL;
  const c = { flight: true, ceiling: C, cols: [], lifts: [], coins: [], spikes: [], bugs: [], checkpoints: [], props: [], solids: [], finish: 206, start: 2, from: -10, to: 220 };
  const prop = (type, x, opts = {}) => {
    const base = opts.y ?? 0;
    c.props.push({ type, x, y: base, len: opts.len ?? 0, z: opts.z, rot: opts.rot, tint: opts.tint });
    let boxes = PROPS[type];
    if (type === 'duct') boxes = [[-0.85, 0.85, C - opts.len - 0.24, C]];
    if (type === 'lamp') boxes = [[-0.5, 0.5, C - opts.len - 0.55, C - opts.len]];
    for (const [a, b, y0, y1] of boxes ?? []) {
      const ceilingPart = type === 'duct' || type === 'lamp';
      c.solids.push({ x0: x + a, x1: x + b, bottom: ceilingPart ? y0 : base + y0, top: ceilingPart ? y1 : base + y1 });
    }
  };
  const coin = (x, y) => c.coins.push({ x, y });
  const cables = (x) => c.spikes.push({ x0: x - 0.5, x1: x + 0.5, y: 0, kind: 'cable' });

  // Floor and ceiling over the whole office
  c.solids.push({ x0: c.from, x1: c.to, bottom: -2.5, top: 0 });
  c.solids.push({ x0: c.from, x1: c.to, bottom: C, top: C + 2 });

  // Morning: reception and lounge
  prop('plant', 6);
  prop('counter', 12);
  prop('coffee', 11.2, { y: 1.5 });
  coin(16, 3.2); // 07:00
  prop('cabinet', 20);
  prop('lamp', 24, { len: 1.8 });
  prop('shelf', 29);
  prop('duct', 29, { len: 1.3 });
  coin(29, 3.75); // turnkey (in the gap)
  prop('plant', 34);
  prop('partition', 38);
  c.checkpoints.push(43);

  // Open space
  prop('desk', 49);
  coin(50, 3.4); // 08:30
  prop('chair', 51.6);
  prop('desk', 55);
  prop('lamp', 58, { len: 2.0 });
  prop('chair', 58);
  prop('partition', 62);
  c.bugs.push({ x: 66, y: 3.5, amp: 1.5, period: 2.4 });
  prop('desk', 70);
  prop('desk', 72.3);
  coin(71, 3.1); // lock-in
  prop('cabinet', 76);
  prop('duct', 76, { len: 2.0 });
  coin(82, 4.6); // Claire
  prop('plant', 84);
  prop('printer', 88);
  cables(90.5);
  c.bugs.push({ x: 94, y: 2.8, amp: 1.6, period: 2.2 });
  c.checkpoints.push(98);

  // Kitchen and meeting room
  prop('counter', 104);
  prop('coffee', 103.4, { y: 1.5 });
  coin(106, 3.5); // 12:00
  prop('fridge', 108.6);
  prop('lamp', 112, { len: 1.6 });
  prop('table', 120);
  prop('lamp', 118.4, { len: 2.2 });
  prop('lamp', 121.6, { len: 2.2 });
  coin(120, 2.45); // Google profiles (between table and lamps)
  prop('whiteboard', 127);
  coin(127, 4.4); // 14:00
  prop('transom', 133);
  c.bugs.push({ x: 138, y: 2.1, amp: 1.1, period: 2.0 });
  prop('partition', 143);
  cables(147);
  c.checkpoints.push(151);

  // Evening: the management office
  prop('desk', 157);
  prop('chair', 159.6);
  coin(161, 4.0); // EU data centres
  prop('shelf', 164);
  prop('duct', 164, { len: 1.5 });
  c.bugs.push({ x: 169, y: 3.4, amp: 1.5, period: 2.6 });
  prop('cabinet', 173);
  prop('cabinet', 174);
  coin(176.5, 3.4); // industries
  cables(179);
  c.checkpoints.push(181);
  prop('plant', 183);
  prop('desk', 187);
  prop('lamp', 189.5, { len: 1.8 });
  coin(190, 2.7); // 50+ projects
  c.bugs.push({ x: 194, y: 4.0, amp: 1.3, period: 2.3 });
  prop('partition', 197.5);
  coin(201, 3.6); // 18:00

  // Ceiling fans: a hazard under the ceiling, so flying along the top is no shortcut. They hang
  // where the ceiling is free, away from lamps, ducts, coins and bugs (blades at C - 0.62).
  c.fans = [9, 18, 45, 60.5, 86, 101, 115, 146, 156, 185].map((x) => ({ x, y: C - 0.62 }));
  for (const f of c.fans) prop('fan', f.x);

  // The goal: Echo arrives at an AI workshop (screen, flipchart, participants turned to the screen).
  prop('screen', 207, { z: -1.15 });
  prop('flipchart', 210.2, { z: -0.95, rot: -0.35 });
  [[202.6, -0.35, 0], [204.4, -0.35, 1], [209.2, -0.35, 2], [203.3, 0.55, 3], [205.3, 0.55, 2], [210.6, 0.5, 1]]
    .forEach(([x, z, tint]) => prop('participant', x, { z, rot: Math.PI + (x < 207 ? -0.45 : 0.45), tint }));

  // Wall modules (4 units): mostly windows, some plain walls, a whiteboard wall, the logo sign
  const pattern = ['WallWindow', 'WallWindow', 'WallPlain', 'WallWindow', 'WallBoard', 'WallWindow', 'WallLogo'];
  c.walls = [];
  for (let k = 0, x = c.from + 2; x < c.to; k++, x += 4) c.walls.push({ x, type: pattern[k % pattern.length] });
  return c;
}

// =====================================================================================
// Level 2: the city at dawn. Echo jumps across rooftops, steel girders on crane cables and
// a window cleaner gondola. Coins: how Echomotion's agents work with people and systems;
// texts only state what echomotion.ai says (home, AI agents, training, consulting pages).
// =====================================================================================

export const CITY_FACTS = [
  {
    title: { de: 'MultiMate', en: 'MultiMate' },
    text: { de: 'In MultiMate, der KI-Plattform von Echomotion, arbeiten dein Team und die KI-Agenten, die Mates, zusammen: Chat, Voice und Whiteboard an einem Ort.', en: 'In MultiMate, Echomotion\'s AI platform, your team and the AI agents, the Mates, work together: chat, voice and whiteboard in one place.' },
  },
  {
    title: { de: 'Du gibst frei', en: 'You approve' },
    text: { de: 'Die Agenten bereiten vor, dein Team entscheidet und gibt frei. Wie viel ein Agent selbst ausführen darf, bestimmst du.', en: 'The agents prepare, your team decides and approves. You set how much an agent may do on its own.' },
  },
  {
    title: { de: 'Mehr als ein Chatbot', en: 'More than a chatbot' },
    text: { de: 'Chatbots reagieren nur auf Fragen. KI-Agenten handeln proaktiv: Sie überwachen, analysieren und erledigen Aufgaben ohne Anweisung.', en: 'Chatbots only answer questions. AI agents act proactively: they monitor, analyse and get tasks done without being told.' },
  },
  {
    title: { de: 'Mitten zwischen den Systemen', en: 'Right between the systems' },
    text: { de: 'Ein Agent sitzt zwischen Systemen, die sich sonst nicht unterhalten: CRM, Postfach, ERP und Buchhaltung.', en: 'An agent sits between systems that would not talk to each other otherwise: CRM, inbox, ERP and accounting.' },
  },
  {
    title: { de: 'Lokal oder Cloud', en: 'Local or cloud' },
    text: { de: 'Mit lokalen Modellen bleiben sensible Daten im Haus, Modelle in der Cloud übernehmen komplexes Reasoning.', en: 'With local models sensitive data stays in-house, models in the cloud take on complex reasoning.' },
  },
  {
    title: { de: 'Data Solutions', en: 'Data solutions' },
    text: { de: 'Echomotion macht Daten verständlich und nutzbar.', en: 'Echomotion makes data understandable and usable.' },
  },
  {
    title: { de: 'Agentic Coding', en: 'Agentic coding' },
    text: { de: 'Agentic Coding: Software, die Agenten unter Review mitentwickeln.', en: 'Agentic coding: software that agents help to develop, under review.' },
  },
  {
    title: { de: 'Im Einsatz', en: 'In use' },
    text: { de: 'Echomotion ist im Einsatz bei Unternehmen wie der Bausparkasse Schwäbisch Hall, DKB, Audi, Dallmayr und Schwalbe.', en: 'Echomotion is in use at companies such as Bausparkasse Schwäbisch Hall, DKB, Audi, Dallmayr and Schwalbe.' },
  },
  {
    title: { de: 'Echte Experten', en: 'Real experts' },
    text: { de: 'Hinter jedem Agenten steht das Team von Echomotion: Die Agenten übernehmen die Routine, das Team die Verantwortung.', en: 'Behind every agent stands the Echomotion team: the agents take on the routine, the team the responsibility.' },
  },
  {
    title: { de: 'Verstehen, Entwickeln, Umsetzen', en: 'Understand, develop, implement' },
    text: { de: 'Erst zuhören und analysieren, dann gemeinsam und iterativ bauen, dann in den Betrieb bringen und langfristig begleiten.', en: 'First listen and analyse, then build together and iteratively, then put it into operation and support it for the long run.' },
  },
  {
    title: { de: 'Die KI-Roadmap', en: 'The AI roadmap' },
    text: { de: 'Aus der KI-Beratung kommt eine priorisierte Roadmap mit konkreten Use Cases, Technologieauswahl, Umsetzungsplan und realistischen ROI-Prognosen.', en: 'AI consulting delivers a prioritised roadmap with concrete use cases, technology choices, an implementation plan and realistic ROI forecasts.' },
  },
  {
    title: { de: 'Selbst weitermachen', en: 'Carry on yourself' },
    text: { de: 'Nach dem Training setzt dein Team neue Use Cases selbst um, ohne externe Hilfe. Das Team lernt durch Machen, direkt mit den eigenen Systemen.', en: 'After the training your team implements new use cases itself, without outside help. The team learns by doing, right with its own systems.' },
  },
];

/** Level 2 course: rooftops (ground columns), girders (floating), a gondola (lift). */
export function buildCityCourse() {
  const c = { cols: [], lifts: [], coins: [], spikes: [], bugs: [], checkpoints: [], finish: 200, start: 2, gags: [] };
  const zoneOf = (x) => (x < 62 ? 0 : x < 132 ? 1 : 2);
  const roof = (x0, x1, top = 0) => { for (let x = x0; x < x1; x++) c.cols.push({ x, top, bottom: -2.5, zone: zoneOf(x) }); };
  const girder = (x0, x1, top) => { for (let x = x0; x < x1; x++) c.cols.push({ x, top, bottom: top - 0.6, zone: zoneOf(x), girder: true }); };
  const coin = (x, y) => c.coins.push({ x, y });
  const gag = (x, kind) => c.gags.push({ x, kind });

  // Zone 1: rooftops of different heights with gaps between the buildings
  roof(-4, 9);
  coin(5, 1.2);
  gag(3, 'Pigeons');
  roof(11, 17, 1); // a higher building: jump up
  roof(17, 22);
  coin(20, 2.0);
  roof(24, 30);
  gag(27, 'Cat');
  roof(30, 38, 1);
  coin(39.5, 3.0); // over the gap
  roof(41, 47);
  c.checkpoints.push(43);
  roof(47, 49, 1);
  roof(49, 56, 2);
  gag(52, 'Billboard');
  coin(53, 3.4);
  roof(58, 62, 1);

  // Zone 2: big gaps, girders hanging from cranes, the window cleaner gondola
  coin(64, 3.4); // flap over the wide gap
  roof(66, 72, 1);
  girder(75, 78, 2);
  girder(81, 84, 3);
  coin(82.5, 4.6);
  girder(87, 90, 2);
  roof(93, 102);
  c.checkpoints.push(95);
  gag(99, 'Pigeons');
  c.lifts.push({ x0: 102, x1: 105, base: 1.15, amp: 1.65, period: 3.2 });
  coin(103.5, 5.2);
  roof(105, 117, 2.5);
  coin(112, 3.7);
  gag(114, 'Billboard');
  roof(117, 121, 1);
  roof(123, 132);
  gag(128, 'Cat');

  // Zone 3: anti-pigeon spikes on the roofs and bug drones
  roof(132, 158);
  c.checkpoints.push(134);
  c.spikes.push({ x0: 138, x1: 139, y: 0, kind: 'pigeon' }, { x0: 146, x1: 147.5, y: 0, kind: 'pigeon' }, { x0: 153, x1: 154, y: 0, kind: 'pigeon' });
  coin(142.5, 1.2);
  coin(150, 3.1);
  c.bugs.push({ x: 156, y: 2.2, amp: 1.0, period: 2.2 });
  roof(161, 178, 1);
  c.checkpoints.push(163);
  c.bugs.push({ x: 169, y: 3.4, amp: 1.2, period: 2.6 }, { x: 175, y: 2.2, amp: 0.9, period: 1.8 });
  coin(172, 2.3);
  roof(178, 181, 2);
  roof(181, 184, 3);
  coin(182.5, 5.0);
  roof(184, 187, 2);
  roof(187, 207);
  c.checkpoints.push(190);
  gag(194, 'Billboard');
  c.cols.sort((a, b) => a.x - b.x);
  c.solids = c.cols.map((col) => ({ x0: col.x, x1: col.x + 1, top: col.top, bottom: col.bottom }));

  // Rooftop obstacles: ventilation shafts and antennas to jump over (solid), power lines (a shock:
  // low ones are jumped over, high ones walked under) and anti-pigeon spikes (like glitches).
  const topAt = (x) => c.cols.find((col) => col.x === Math.floor(x))?.top ?? 0;
  c.vents = [[7, 1, 0.8], [25, 1, 1.0], [50, 1, 0.8], [96, 2, 0.9], [115, 1, 0.9], [141, 1, 0.8], [192, 1, 0.8]]
    .map(([x, w, h]) => ({ x0: x, x1: x + w, y: topAt(x), h }));
  c.antennas = [14, 55, 69, 113].map((x) => ({ x, y: topAt(x) }));
  // Obstacles keep clear of landings after gaps and steps (Echo needs a moment to land and jump),
  // and a high line never ends right before a step up (Echo could not jump under it).
  c.wires = [[19, 20.6, 0.7], [43.5, 46, 1.35], [127, 130.5, 1.35], [149, 150.6, 0.7]] // low ones: one jump long
    .map(([x0, x1, h]) => ({ x0, x1, y: topAt(x0) + h, base: topAt(x0), h }));
  c.spikes.push({ x0: 33, x1: 34, y: 1, kind: 'pigeon' }, { x0: 109, x1: 110, y: 2.5, kind: 'pigeon' }, { x0: 197, x1: 198, y: 0, kind: 'pigeon' });
  for (const v of c.vents) c.solids.push({ x0: v.x0 + 0.05, x1: v.x1 - 0.05, bottom: v.y, top: v.y + v.h });
  for (const a of c.antennas) c.solids.push({ x0: a.x + 0.35, x1: a.x + 0.65, bottom: a.y, top: a.y + 1.45 });

  // Flying (Nov 2026, like the forest): every press is a wing beat. A low cloud deck is the
  // ceiling, helicopters and ravens patrol the upper air under it (back and forth like the
  // eagles), so flying high is risky. Under them a wing beat from the highest roofs (3) stays
  // clear (Echo is 0.95 tall, a beat lifts it about 1.7); above them there is no room to pass.
  c.ceiling = CITY_CEIL;
  c.eagles = [
    { x0: 12, x1: 24, y: 6.2, period: 6.5, kind: 'heli' }, { x0: 30, x1: 40, y: 6.1, period: 4.8, kind: 'raven' },
    { x0: 63, x1: 79, y: 6.2, period: 7.0, kind: 'heli' }, { x0: 84, x1: 92, y: 6.1, period: 4.4, kind: 'raven' },
    // None over the high roof with the antenna (105-117): there the gap would be too tight.
    { x0: 118, x1: 130, y: 6.2, period: 6.0, kind: 'heli' }, { x0: 132, x1: 139, y: 6.1, period: 4.0, kind: 'raven' },
    { x0: 142, x1: 154, y: 6.2, period: 6.0, kind: 'heli' }, { x0: 165, x1: 175, y: 6.1, period: 4.4, kind: 'raven' },
    { x0: 184, x1: 196, y: 6.2, period: 6.0, kind: 'heli' },
  ];
  c.solids.push({ x0: -10, x1: 220, bottom: c.ceiling, top: c.ceiling + 2 });
  return c;
}

/**
 * The levels of Echo Parkour, in playing order: magic forest, city, office. The keys stay as
 * they were introduced (leaderboards and badges keep their data): 'parkour' is the forest,
 * 'parkour3' the city, 'parkour2' the office.
 */
export const LEVELS = {
  1: { n: 1, key: 'parkour', world: 'forest', title: 'parkourTitle', intro: 'parkourIntro', build: buildCourse, facts: COIN_FACTS, flight: true },
  2: { n: 2, key: 'parkour3', world: 'city', title: 'parkour3Name', intro: 'parkourIntro3', build: buildCityCourse, facts: CITY_FACTS, flight: true },
  3: { n: 3, key: 'parkour2', world: 'office', title: 'parkour2Name', intro: 'parkourIntro2', build: buildOfficeCourse, facts: OFFICE_FACTS, flight: true },
};
