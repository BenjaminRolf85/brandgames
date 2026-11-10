// What Echo says as host: onboarding, game intros, badges, event mode. Bilingual, first person.
// The keys double as ids for optional recordings (assets/sounds/echo/clips.json).

/** Adds lines from a game's own text module (e.g. intro_bike), without overwriting. */
export function addLines(lines) {
  for (const [k, v] of Object.entries(lines)) if (!(k in ECHO_LINES)) ECHO_LINES[k] = v;
}

export const ECHO_LINES = {
  // ----- onboarding -----
  onboardHello: {
    de: 'Hallo, ich bin Echo, das Maskottchen von Echomotion! Ich zeige dir in einer Minute, wie hier alles funktioniert.',
    en: 'Hi, I am Echo, the Echomotion mascot! In one minute I will show you how everything works here.',
  },
  onboardPointXR: {
    de: 'Zeig mit dem Controller oder deiner Hand auf einen Knopf. Zum Drücken nimmst du den Trigger oder tippst Daumen und Zeigefinger kurz zusammen. Probier es gleich unten aus!',
    en: 'Point at a button with your controller or your hand. To press it, pull the trigger or tap thumb and index finger together. Try it right below!',
  },
  onboardPointScreen: {
    de: 'Klick oder tipp einfach auf einen Knopf. Probier es gleich unten aus!',
    en: 'Just click or tap a button. Try it right below!',
  },
  onboardTap: {
    de: 'Super! Und jetzt tipp mich an. Zeig auf mich und drück, so wie eben beim Knopf.',
    en: 'Great! Now tap me. Point at me and press, just like the button.',
  },
  onboardTapped: {
    de: 'Hihi, das kitzelt! In jedem Spiel lernst du etwas über KI. Für jedes Thema gibt es ein Abzeichen für deinen KI-Führerschein, und am Ende dein Zertifikat aufs Handy.',
    en: 'Hehe, that tickles! Every game teaches you something about AI. Each topic earns you a badge for your AI licence, and in the end your certificate on your phone.',
  },
  // ----- game intros -----
  intro_quiz: {
    de: 'Fragen quer durch die KI-Welt. Jede richtige Antwort baut dein Wissenshaus weiter. Ich halte dir die Flügel gedrückt!',
    en: 'Questions across the world of AI. Every right answer builds your knowledge house. I am keeping my wings crossed!',
  },
  // Christmas edition (SEASON 'christmas'): used instead of the line without _xmas
  intro_quiz_xmas: {
    de: 'Fragen quer durch die KI-Welt. Jede richtige Antwort schmückt deinen Weihnachtsbaum, mit Kugeln von Echomotion und zum Schluss dem Stern. Ich halte dir die Flügel gedrückt!',
    en: 'Questions across the world of AI. Every right answer decorates your Christmas tree, with Echomotion baubles and finally the star. I am keeping my wings crossed!',
  },
  intro_review: {
    de: 'Hier kommen die Fragen, die noch gewackelt haben. Wiederholen ist der Trick, mit dem auch KI lernt.',
    en: 'Here come the questions that were still shaky. Repetition is the trick AI learns with, too.',
  },
  intro_factmyth: {
    de: 'Über KI kursiert viel Halbwissen. Fakt oder Mythos? Lass es uns gemeinsam entlarven!',
    en: 'There is a lot of half-knowledge about AI. Fact or myth? Let us bust it together!',
  },
  intro_sort: {
    de: 'Ordne die Begriffe richtig zu. Wer die Wörter kennt, versteht die Technik dahinter.',
    en: 'Sort the concepts correctly. Knowing the words means understanding the tech behind them.',
  },
  intro_timeline: {
    de: 'KI ist älter, als viele denken. Bring die Meilensteine in die richtige Reihenfolge!',
    en: 'AI is older than many think. Put the milestones in the right order!',
  },
  intro_pong: {
    de: 'Die KI lernt deinen Stil mit jedem Ballwechsel. Bleib unberechenbar, dann hast du sie!',
    en: 'The AI learns your style with every rally. Stay unpredictable and you have got it!',
  },
  intro_dataflight: {
    de: 'Brille auf, wir fliegen durch vier Datenwelten! Ich folge deiner Hand. Fang die guten Daten, flieg durch die Tore und weich den schlechten aus. Und am Ende besiegen wir zusammen das Hacker-Mutterschiff!',
    en: 'Goggles on, we are flying through four data worlds! I follow your hand. Catch the good data, fly through the gates and dodge the bad. And at the end we defeat the hacker mothership together!',
  },
  intro_arch: {
    de: 'Willkommen im Datenhaushalt einer Bank! Folge den Datenflüssen von System zu System.',
    en: 'Welcome to the data landscape of a bank! Follow the data flows from system to system.',
  },
  intro_fight: {
    de: 'In der Arena zeigt der Roboter jeden Angriff an. Reagiere schnell, aber Vorsicht: Er merkt sich deine Antworten und täuscht dich mit Finten. Und wenn du willst, kämpfe ich für dich!',
    en: 'In the arena the robot shows every attack before it strikes. React fast, but careful: it remembers your answers and tricks you with feints. And if you like, I will fight for you!',
  },
  intro_fight_xmas: {
    de: 'Heute boxt der Weihnachtsmann gegen Roboter mit grünen Miesepeter-Mützen! Der Roboter zeigt jeden Angriff über dem Kopf an: Reagiere, bevor der Ring zu ist. Aber Vorsicht vor Finten! Und mein Sonar stoppt nur ein Faustschlag.',
    en: 'Today Santa boxes against robots in grumpy green hats! The robot shows every attack above its head: react before the ring closes. But watch out for feints! And only a punch stops my sonar.',
  },
  intro_parkour: {
    de: 'Flieg mit mir durch den Zauberwald! Jede Münze verrät dir, was wir bei Echomotion machen. Pass auf die Adler auf, und halt die Augen offen: In der Erde ist so manches vergraben.',
    en: 'Fly through the magic forest with me! Every coin tells you what we do at Echomotion. Watch out for the eagles, and keep your eyes open: all sorts of things are buried in the ground.',
  },
  intro_parkour3: {
    de: 'Guten Morgen, Stadt! Heute fliege ich über die Dächer. Pass mit mir auf die Hubschrauber und Raben da oben auf. Jede Münze zeigt dir, wie KI-Agenten mit Menschen und Systemen zusammenarbeiten.',
    en: 'Good morning, city! Today I am flying over the rooftops. Help me watch out for the helicopters and ravens up there. Every coin shows you how AI agents work together with people and systems.',
  },
  intro_parkour2: {
    de: 'Heute fliege ich durchs Büro, von 7 Uhr morgens bis zum Feierabend. Sammle die Münzen und erfahre, wie ein KI-Agent den Arbeitstag begleitet.',
    en: 'Today I fly through the office, from 7 in the morning to closing time. Collect the coins and see how an AI agent accompanies the working day.',
  },
  intro_robot0: {
    de: 'Ich weiß noch gar nichts! Ich probiere einfach aus, und du schaust zu, wie ich durch Belohnung lerne.',
    en: 'I know nothing yet! I will just try things, and you watch me learn from rewards.',
  },
  intro_robot1: {
    de: 'Hilf mir! Leg mir einen Weg aus Pfeilen, ich fliege ihn ab und merke ihn mir.',
    en: 'Help me! Lay out a route of arrows, I will fly it and remember it.',
  },
  intro_robot2: {
    de: 'Jetzt wird es spannend: Du bestimmst, wofür ich Punkte bekomme. Ich mache genau das, was belohnt wird.',
    en: 'Now it gets exciting: you decide what I earn points for. I will do exactly what is rewarded.',
  },
  // ----- badges -----
  badgeNew: {
    de: 'Glückwunsch! Neues Abzeichen für deinen KI-Führerschein: {name}.',
    en: 'Congratulations! New badge for your AI licence: {name}.',
  },
  badgeAll: {
    de: 'Wow, alle Abzeichen! Dein KI-Führerschein ist komplett. Hol dir dein Zertifikat im Menü.',
    en: 'Wow, all badges! Your AI licence is complete. Get your certificate in the menu.',
  },
  // ----- menu and event mode -----
  menuTap: {
    de: 'Huch! Such dir ein Spiel aus, ich flieg mit.',
    en: 'Oops! Pick a game, I will fly along.',
  },
  attract: {
    de: 'Hallo! Ich bin Echo. Tipp mich an und entdecke mit mir Künstliche Intelligenz im Raum.',
    en: 'Hi! I am Echo. Tap me and discover artificial intelligence in the room with me.',
  },
  eventThanks: {
    de: 'Danke fürs Mitspielen! Scann den Code und nimm dein Ergebnis mit.',
    en: 'Thanks for playing! Scan the code and take your result with you.',
  },
};
