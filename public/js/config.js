// Which game modes are shown (menu, landing page, leaderboard). Hidden modes stay in the code
// and can be switched back on by adding their key here.
// 'robot' (Train Echo, Q-learning) is replaced by 'parkour' (Echo Parkour) and only hidden.
// Echo Parkour has three levels: 'parkour' (1, magic forest), 'parkour3' (2, city) and 'parkour2'
// (3, office). Levels 2 and 3 open from inside Echo Parkour; they have no menu tile of their own.
// Since November 2026 the bank data landscape ('arch') and Fact or Myth ('factmyth') are hidden.
// Games for our clients (Christmas 2026), each with its own row in the menu ('For our clients').
export const CLIENT_GAMES = ['bike', 'roast', 'bricks', 'green', 'dock', 'pinball', 'summit'];
export const VISIBLE_MODES = ['quiz', 'parkour', 'parkour3', 'parkour2', 'pong', 'dataflight', 'fight', ...CLIENT_GAMES];

// Echomotion's background music (assets/music). All games share one playlist that plays in a
// random order: shuffled anew for every game and every round through the list, never starting
// with the track that was heard last. New tracks: add the file name to TRACKS.
// MUSIC lists the games that play music (the quizzes calm, the action games a little louder).
export const TRACKS = ['echo-song', 'naechster-sprung', 'echo-beratung', 'echo-experten', 'echo-training']
  .map((name) => `assets/music/${name}.mp3`);
// Christmas edition (SEASON 'christmas'): every game starts with its own song and the app with
// "Danke" when it opens; a game that lasts longer than its song goes on with "EN", then the two
// take turns. Games without a song of their own keep the shuffled playlist above.
export const XMAS_SONGS = {
  start: 'xmas-danke',
  parkour: 'xmas-jump',
  parkour3: 'xmas-jump',
  parkour2: 'xmas-jump',
  pong: 'xmas-pong',
  dataflight: 'xmas-flight',
  fight: 'xmas-boxing',
  quiz: 'xmas-quiz',
  review: 'xmas-quiz',
  factmyth: 'xmas-quiz',
  // The games for our clients are a thank-you: they start with "Danke".
  bike: 'xmas-danke',
  roast: 'xmas-danke',
  bricks: 'xmas-danke',
  green: 'xmas-danke',
  dock: 'xmas-danke',
  pinball: 'xmas-danke',
  summit: 'xmas-danke',
};
export const XMAS_MORE = 'xmas-en';
export const MUSIC = {
  parkour: true,
  parkour3: true,
  parkour2: true,
  pong: true,
  dataflight: true,
  arch: true,
  fight: true,
  quiz: true,
  review: true,
  factmyth: true,
  sort: true,
  timeline: true,
  robot: true,
  bike: true,
  roast: true,
  bricks: true,
  green: true,
  dock: true,
  pinball: true,
  summit: true,
};

// Seasonal decoration: 'christmas' puts a Santa hat on Echo and a Christmas tree with fairy lights
// and a string of lights into the menu (christmas.js), and lets it snow in the Echo Parkour and the
// AI Arena with a wintry forest and city (snow.js). 'winter' is only the snow. null switches it off.
export const SEASON = 'christmas';
