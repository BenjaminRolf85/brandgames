// All learning content, bilingual. Every item gets a stable id (used by the
// spaced-repetition progress store), so only ever APPEND to these lists.

export const TOPICS = {
  basics: { de: 'Grundlagen', en: 'Basics' },
  genai: { de: 'Generative KI', en: 'Generative AI' },
  ethics: { de: 'Ethik & Recht', en: 'Ethics & law' },
  history: { de: 'Geschichte', en: 'History' },
  everyday: { de: 'KI im Alltag', en: 'AI in everyday life' },
  myth: { de: 'Fakt oder Mythos', en: 'Fact or myth' },
  concepts: { de: 'Begriffe', en: 'Concepts' },
  sponsor: { de: 'Sponsor-Bonus · doppelte Punkte', en: 'Sponsor bonus · double points' },
};

export const QUIZ = [
  {
    topic: 'basics',
    q: { de: 'Wofür steht die Abkürzung „LLM“?', en: 'What does the abbreviation “LLM” stand for?' },
    a: [
      { de: 'Large Language Model', en: 'Large Language Model' },
      { de: 'Low Latency Machine', en: 'Low Latency Machine' },
      { de: 'Linear Logic Module', en: 'Linear Logic Module' },
      { de: 'Learning Loop Method', en: 'Learning Loop Method' },
    ],
    c: 0,
    x: { de: 'Ein LLM ist ein großes Sprachmodell, das mit riesigen Textmengen trainiert wurde.', en: 'An LLM is a large language model trained on huge amounts of text.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was ist ein „Token“ bei Sprachmodellen?', en: 'What is a “token” in language models?' },
    a: [
      { de: 'Ein Passwort für den Zugang', en: 'A password for access' },
      { de: 'Ein Textstück, z. B. ein Wort oder Wortteil', en: 'A piece of text, e.g. a word or part of a word' },
      { de: 'Eine Kryptowährung', en: 'A cryptocurrency' },
      { de: 'Ein Grafikchip', en: 'A graphics chip' },
    ],
    c: 1,
    x: { de: 'Modelle zerlegen Text in Tokens und verarbeiten bzw. erzeugen ihn Stück für Stück.', en: 'Models split text into tokens and process or generate it piece by piece.' },
  },
  {
    topic: 'basics',
    q: { de: 'Welche Lernart nutzt Beispiele mit bekannten richtigen Antworten (Labels)?', en: 'Which learning type uses examples with known correct answers (labels)?' },
    a: [
      { de: 'Unüberwachtes Lernen', en: 'Unsupervised learning' },
      { de: 'Bestärkendes Lernen', en: 'Reinforcement learning' },
      { de: 'Überwachtes Lernen', en: 'Supervised learning' },
      { de: 'Zufälliges Lernen', en: 'Random learning' },
    ],
    c: 2,
    x: { de: 'Beim überwachten Lernen lernt das Modell aus Eingaben mit passenden Labels, z. B. „Spam“ oder „kein Spam“.', en: 'In supervised learning the model learns from inputs paired with labels, e.g. “spam” or “not spam”.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was bezeichnet man bei KI als „Halluzination“?', en: 'What is called a “hallucination” in AI?' },
    a: [
      { de: 'Einen Grafikfehler in VR', en: 'A graphics glitch in VR' },
      { de: 'Überhitzung der Hardware', en: 'Overheating hardware' },
      { de: 'Einen besonders kreativen Prompt', en: 'An especially creative prompt' },
      { de: 'Überzeugend klingende, aber falsche Ausgaben', en: 'Convincing-sounding but false output' },
    ],
    c: 3,
    x: { de: 'Sprachmodelle können Fakten erfinden, die plausibel klingen. Deshalb: wichtige Infos immer prüfen.', en: 'Language models can invent facts that sound plausible. So always verify important information.' },
  },
  {
    topic: 'basics',
    q: { de: 'Womit arbeitet bestärkendes Lernen (Reinforcement Learning)?', en: 'What does reinforcement learning rely on?' },
    a: [
      { de: 'Belohnungen und Bestrafungen', en: 'Rewards and penalties' },
      { de: 'Nur beschriftete Bilder', en: 'Labeled images only' },
      { de: 'Fest programmierte Regeln', en: 'Hard-coded rules' },
      { de: 'Gar keine Rückmeldung', en: 'No feedback at all' },
    ],
    c: 0,
    x: { de: 'Ein Agent probiert Aktionen aus und lernt, welche ihm die meiste Belohnung bringen.', en: 'An agent tries actions and learns which ones earn the most reward.' },
  },
  {
    topic: 'basics',
    q: { de: 'Wovon sind künstliche neuronale Netze grob inspiriert?', en: 'What are artificial neural networks loosely inspired by?' },
    a: [
      { de: 'Vom Aufbau des Internets', en: 'The structure of the internet' },
      { de: 'Von Nervenzellen im Gehirn', en: 'Nerve cells in the brain' },
      { de: 'Von Pflanzenwurzeln', en: 'Plant roots' },
      { de: 'Von Tabellenkalkulationen', en: 'Spreadsheets' },
    ],
    c: 1,
    x: { de: 'Künstliche Neuronen gewichten Eingaben und geben ein Signal weiter, stark vereinfacht wie biologische Neuronen.', en: 'Artificial neurons weight their inputs and pass on a signal, a strongly simplified version of biological neurons.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was ist ein „Prompt“?', en: 'What is a “prompt”?' },
    a: [
      { de: 'Die Antwort des Modells', en: 'The model’s answer' },
      { de: 'Ein Server im Rechenzentrum', en: 'A server in a data center' },
      { de: 'Die Eingabe bzw. Anweisung an ein KI-Modell', en: 'The input or instruction given to an AI model' },
      { de: 'Ein Fehlercode', en: 'An error code' },
    ],
    c: 2,
    x: { de: 'Ein klarer Prompt mit Kontext und Ziel führt meist zu deutlich besseren Ergebnissen.', en: 'A clear prompt with context and a goal usually leads to much better results.' },
  },
  {
    topic: 'ethics',
    q: { de: 'Was bedeutet „Bias“ bei KI-Systemen?', en: 'What does “bias” mean in AI systems?' },
    a: [
      { de: 'Eine Maßeinheit für Rechenleistung', en: 'A unit of computing power' },
      { de: 'Eine Art Verschlüsselung', en: 'A type of encryption' },
      { de: 'Ein Grafikkarten-Modell', en: 'A graphics card model' },
      { de: 'Systematische Verzerrungen, oft durch einseitige Daten', en: 'Systematic distortions, often from one-sided data' },
    ],
    c: 3,
    x: { de: 'Spiegeln Trainingsdaten Vorurteile wider, kann die KI diese übernehmen und verstärken.', en: 'If training data reflects prejudice, the AI can adopt and amplify it.' },
  },
  {
    topic: 'ethics',
    q: { de: 'Wonach unterteilt der EU AI Act KI-Systeme?', en: 'How does the EU AI Act classify AI systems?' },
    a: [
      { de: 'Nach ihrem Risiko', en: 'By their level of risk' },
      { de: 'Nach dem Herkunftsland', en: 'By country of origin' },
      { de: 'Nach dem Preis', en: 'By price' },
      { de: 'Nach der Programmiersprache', en: 'By programming language' },
    ],
    c: 0,
    x: { de: 'Je höher das Risiko für Menschen, desto strenger die Pflichten, bis hin zu Verboten.', en: 'The higher the risk to people, the stricter the obligations, up to outright bans.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was beschreibt das „Kontextfenster“ eines Sprachmodells?', en: 'What does the “context window” of a language model describe?' },
    a: [
      { de: 'Die Größe des Browserfensters', en: 'The size of the browser window' },
      { de: 'Wie viel Text das Modell auf einmal berücksichtigen kann', en: 'How much text the model can consider at once' },
      { de: 'Die Dauer des Trainings', en: 'How long training took' },
      { de: 'Die Anzahl der Nutzer', en: 'The number of users' },
    ],
    c: 1,
    x: { de: 'Alles außerhalb des Kontextfensters „sieht“ das Modell in diesem Moment nicht.', en: 'Anything outside the context window is invisible to the model at that moment.' },
  },
  {
    topic: 'everyday',
    q: { de: 'Was macht „Computer Vision“?', en: 'What does “computer vision” do?' },
    a: [
      { de: 'Sie verbessert die Bildschirmauflösung', en: 'It improves screen resolution' },
      { de: 'Sie ist eine Brillenmarke', en: 'It is a brand of glasses' },
      { de: 'Sie analysiert und versteht Bilder und Videos', en: 'It analyzes and understands images and video' },
      { de: 'Sie komprimiert Videos', en: 'It compresses video' },
    ],
    c: 2,
    x: { de: 'Auch deine Quest nutzt Computer Vision, z. B. für Hand-Tracking und Raumerkennung.', en: 'Your Quest uses computer vision too, e.g. for hand tracking and room detection.' },
  },
  {
    topic: 'history',
    q: { de: 'In welchem Jahr wurde der Begriff „Künstliche Intelligenz“ geprägt?', en: 'In which year was the term “artificial intelligence” coined?' },
    a: [
      { de: '1985', en: '1985' },
      { de: '2001', en: '2001' },
      { de: '2012', en: '2012' },
      { de: '1956', en: '1956' },
    ],
    c: 3,
    x: { de: 'Auf der Dartmouth-Konferenz 1956 wurde „Artificial Intelligence“ als Forschungsfeld begründet.', en: 'The 1956 Dartmouth workshop established “artificial intelligence” as a research field.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was ist „Fine-Tuning“?', en: 'What is “fine-tuning”?' },
    a: [
      { de: 'Ein vortrainiertes Modell mit speziellen Daten weitertrainieren', en: 'Further training a pretrained model on specific data' },
      { de: 'Einen Monitor kalibrieren', en: 'Calibrating a monitor' },
      { de: 'Die Hardware übertakten', en: 'Overclocking the hardware' },
      { de: 'Trainingsdaten löschen', en: 'Deleting training data' },
    ],
    c: 0,
    x: { de: 'So wird ein allgemeines Modell gezielt an eine Aufgabe oder einen Stil angepasst.', en: 'This adapts a general model to a specific task or style.' },
  },
  {
    topic: 'ethics',
    q: { de: 'Was ist ein „Deepfake“?', en: 'What is a “deepfake”?' },
    a: [
      { de: 'Ein besonders tiefes neuronales Netz', en: 'A particularly deep neural network' },
      { de: 'Mit KI manipulierte oder erzeugte Medien, die echt wirken', en: 'AI-manipulated or generated media that looks real' },
      { de: 'Ein Fehler im Trainingsprozess', en: 'An error in the training process' },
      { de: 'Ein Unterwasser-Roboter', en: 'An underwater robot' },
    ],
    c: 1,
    x: { de: 'Deepfakes können Gesichter und Stimmen täuschend echt imitieren. Quellen prüfen hilft.', en: 'Deepfakes can imitate faces and voices convincingly. Checking sources helps.' },
  },
  {
    topic: 'genai',
    q: { de: 'Wofür steht „GPT“ in ChatGPT?', en: 'What does “GPT” in ChatGPT stand for?' },
    a: [
      { de: 'Generative Pre-trained Transformer', en: 'Generative Pre-trained Transformer' },
      { de: 'General Purpose Technology', en: 'General Purpose Technology' },
      { de: 'Graphical Processing Tool', en: 'Graphical Processing Tool' },
      { de: 'Global Prompt Translator', en: 'Global Prompt Translator' },
    ],
    c: 0,
    x: { de: 'Ein Transformer-Modell, das vorab mit großen Textmengen trainiert wurde und neuen Text erzeugt.', en: 'A transformer model pretrained on large amounts of text that generates new text.' },
  },
  {
    topic: 'genai',
    q: { de: 'Wofür steht „RAG“ bei KI-Anwendungen?', en: 'What does “RAG” stand for in AI applications?' },
    a: [
      { de: 'Random Answer Generator', en: 'Random Answer Generator' },
      { de: 'Retrieval-Augmented Generation', en: 'Retrieval-Augmented Generation' },
      { de: 'Rapid AI Growth', en: 'Rapid AI Growth' },
      { de: 'Reinforced Attention Graph', en: 'Reinforced Attention Graph' },
    ],
    c: 1,
    x: { de: 'Das Modell sucht zuerst passende Dokumente heraus und nutzt sie für seine Antwort. So werden Antworten aktueller und belegbar.', en: 'The model first retrieves matching documents and uses them for its answer, making answers more current and verifiable.' },
  },
  {
    topic: 'basics',
    q: { de: 'Was ist ein „Parameter“ in einem neuronalen Netz?', en: 'What is a “parameter” in a neural network?' },
    a: [
      { de: 'Ein Eingabefeld in der App', en: 'An input field in the app' },
      { de: 'Eine Fehlermeldung', en: 'An error message' },
      { de: 'Ein lernbares Gewicht im Netz', en: 'A learnable weight in the network' },
      { de: 'Ein Nutzerkonto', en: 'A user account' },
    ],
    c: 2,
    x: { de: 'Große Sprachmodelle haben Milliarden solcher Gewichte, die beim Training angepasst werden.', en: 'Large language models have billions of such weights that are adjusted during training.' },
  },
  {
    topic: 'basics',
    q: { de: 'Was passiert beim „Training“ eines Modells?', en: 'What happens when a model is “trained”?' },
    a: [
      { de: 'Das Modell wird auf Viren geprüft', en: 'The model is scanned for viruses' },
      { de: 'Die Daten werden gelöscht', en: 'The data is deleted' },
      { de: 'Das Modell wird ins Internet hochgeladen', en: 'The model is uploaded to the internet' },
      { de: 'Die Parameter werden schrittweise angepasst, damit Fehler kleiner werden', en: 'The parameters are adjusted step by step so errors get smaller' },
    ],
    c: 3,
    x: { de: 'Das Modell macht Vorhersagen, misst seinen Fehler und korrigiert seine Gewichte, Millionen Mal.', en: 'The model makes predictions, measures its error and corrects its weights, millions of times.' },
  },
  {
    topic: 'basics',
    q: { de: 'Was bedeutet „Overfitting“?', en: 'What does “overfitting” mean?' },
    a: [
      { de: 'Das Modell lernt die Trainingsdaten auswendig und versagt bei neuen Daten', en: 'The model memorizes its training data and fails on new data' },
      { de: 'Das Modell ist zu groß für den Speicher', en: 'The model is too big for memory' },
      { de: 'Das Modell trainiert zu schnell', en: 'The model trains too fast' },
      { de: 'Das Modell passt nicht auf den Bildschirm', en: 'The model does not fit on the screen' },
    ],
    c: 0,
    x: { de: 'Gute Modelle verallgemeinern: Sie funktionieren auch bei Beispielen, die sie nie gesehen haben.', en: 'Good models generalize: they also work on examples they have never seen.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was ist ein „multimodales“ Modell?', en: 'What is a “multimodal” model?' },
    a: [
      { de: 'Ein Modell mit mehreren Bildschirmen', en: 'A model with several screens' },
      { de: 'Ein Modell, das mehrere Datenarten wie Text, Bild und Audio verarbeitet', en: 'A model that handles several data types such as text, images and audio' },
      { de: 'Ein Modell, das nur nachts läuft', en: 'A model that only runs at night' },
      { de: 'Ein Modell für Mode', en: 'A model for fashion' },
    ],
    c: 1,
    x: { de: 'Multimodale Modelle können z. B. ein Foto beschreiben oder Fragen zu einem Diagramm beantworten.', en: 'Multimodal models can, for example, describe a photo or answer questions about a chart.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was steuert die „Temperatur“ bei Sprachmodellen?', en: 'What does “temperature” control in language models?' },
    a: [
      { de: 'Wie heiß der Server wird', en: 'How hot the server gets' },
      { de: 'Die Sprache der Antwort', en: 'The language of the answer' },
      { de: 'Wie zufällig bzw. kreativ die Ausgaben sind', en: 'How random or creative the outputs are' },
      { de: 'Die Länge des Trainings', en: 'The length of training' },
    ],
    c: 2,
    x: { de: 'Niedrige Temperatur: vorhersehbare Antworten. Hohe Temperatur: abwechslungsreicher, aber fehleranfälliger.', en: 'Low temperature: predictable answers. High temperature: more varied, but more error-prone.' },
  },
  {
    topic: 'ethics',
    q: { de: 'Was bedeutet „Human in the Loop“?', en: 'What does “human in the loop” mean?' },
    a: [
      { de: 'Ein Mensch trainiert im Kreis', en: 'A person trains in circles' },
      { de: 'Die KI ersetzt den Menschen komplett', en: 'The AI fully replaces the human' },
      { de: 'Ein Roboter mit menschlichem Gesicht', en: 'A robot with a human face' },
      { de: 'Ein Mensch prüft und verantwortet wichtige KI-Entscheidungen', en: 'A human reviews and is accountable for important AI decisions' },
    ],
    c: 3,
    x: { de: 'Gerade bei Entscheidungen über Menschen sorgt menschliche Kontrolle für Fairness und Verantwortung.', en: 'Especially for decisions about people, human oversight ensures fairness and accountability.' },
  },
  {
    topic: 'ethics',
    q: { de: 'Welche KI-Praxis verbietet der EU AI Act?', en: 'Which AI practice does the EU AI Act prohibit?' },
    a: [
      { de: 'Social Scoring, also das Bewerten von Menschen nach ihrem Sozialverhalten', en: 'Social scoring, i.e. rating people by their social behavior' },
      { de: 'Rechtschreibprüfung', en: 'Spell checking' },
      { de: 'Spamfilter', en: 'Spam filters' },
      { de: 'Übersetzungsprogramme', en: 'Translation software' },
    ],
    c: 0,
    x: { de: 'Social Scoring gilt als „unannehmbares Risiko“ und ist in der EU verboten.', en: 'Social scoring is classed as “unacceptable risk” and banned in the EU.' },
  },
  {
    topic: 'ethics',
    q: { de: 'Wie schützt du dich am besten vor Deepfakes?', en: 'What is the best protection against deepfakes?' },
    a: [
      { de: 'Nur Videos mit hoher Auflösung glauben', en: 'Only trust high-resolution videos' },
      { de: 'Quelle prüfen und mit anderen Quellen vergleichen', en: 'Check the source and compare with other sources' },
      { de: 'Alles sofort teilen', en: 'Share everything right away' },
      { de: 'Nur auf Social Media informieren', en: 'Only get news from social media' },
    ],
    c: 1,
    x: { de: 'Wer hat es veröffentlicht, und berichten seriöse Quellen dasselbe? Das entlarvt viele Fälschungen.', en: 'Who published it, and do reputable sources report the same? That exposes many fakes.' },
  },
  {
    topic: 'everyday',
    q: { de: 'Wo begegnet dir KI im Alltag oft unbemerkt?', en: 'Where do you often meet AI in everyday life without noticing?' },
    a: [
      { de: 'Beim Lichtschalter', en: 'At the light switch' },
      { de: 'Bei einer Analoguhr', en: 'On an analog watch' },
      { de: 'Bei Empfehlungen von Streaming-Diensten und Online-Shops', en: 'In recommendations from streaming services and online shops' },
      { de: 'Beim Papierkalender', en: 'In a paper calendar' },
    ],
    c: 2,
    x: { de: 'Empfehlungssysteme lernen aus deinem Verhalten, was dich wahrscheinlich interessiert.', en: 'Recommender systems learn from your behavior what will probably interest you.' },
  },
  {
    topic: 'everyday',
    q: { de: 'Was macht ein Sprachassistent als Erstes, wenn du mit ihm sprichst?', en: 'What does a voice assistant do first when you talk to it?' },
    a: [
      { de: 'Er druckt die Antwort aus', en: 'It prints the answer' },
      { de: 'Er ruft einen Menschen an', en: 'It calls a human' },
      { de: 'Er löscht den Verlauf', en: 'It deletes the history' },
      { de: 'Er wandelt deine Sprache in Text um', en: 'It converts your speech into text' },
    ],
    c: 3,
    x: { de: 'Spracherkennung (Speech-to-Text) ist der erste Schritt, danach wird der Text verstanden und beantwortet.', en: 'Speech recognition (speech-to-text) is the first step, then the text is interpreted and answered.' },
  },
  {
    topic: 'history',
    q: { de: 'Wer schlug 1950 einen Test vor, um zu prüfen, ob Maschinen denken können?', en: 'Who proposed a test in 1950 to check whether machines can think?' },
    a: [
      { de: 'Alan Turing', en: 'Alan Turing' },
      { de: 'Ada Lovelace', en: 'Ada Lovelace' },
      { de: 'Albert Einstein', en: 'Albert Einstein' },
      { de: 'Konrad Zuse', en: 'Konrad Zuse' },
    ],
    c: 0,
    x: { de: 'Beim Turing-Test soll ein Mensch im Chat nicht unterscheiden können, ob er mit Mensch oder Maschine schreibt.', en: 'In the Turing test, a person chatting should not be able to tell whether they are talking to a human or a machine.' },
  },
  {
    topic: 'history',
    q: { de: 'Welches Programm besiegte 2016 den Go-Spitzenspieler Lee Sedol?', en: 'Which program beat top Go player Lee Sedol in 2016?' },
    a: [
      { de: 'Deep Blue', en: 'Deep Blue' },
      { de: 'AlphaGo', en: 'AlphaGo' },
      { de: 'Watson', en: 'Watson' },
      { de: 'ELIZA', en: 'ELIZA' },
    ],
    c: 1,
    x: { de: 'AlphaGo kombinierte neuronale Netze mit bestärkendem Lernen. Go galt lange als zu komplex für Computer.', en: 'AlphaGo combined neural networks with reinforcement learning. Go was long thought too complex for computers.' },
  },
  {
    topic: 'basics',
    q: { de: 'Was ist „Deep Learning“?', en: 'What is “deep learning”?' },
    a: [
      { de: 'Lernen in der Tiefsee', en: 'Learning in the deep sea' },
      { de: 'Besonders langsames Lernen', en: 'Particularly slow learning' },
      { de: 'Machine Learning mit neuronalen Netzen aus vielen Schichten', en: 'Machine learning with neural networks made of many layers' },
      { de: 'Auswendiglernen von Daten', en: 'Memorizing data' },
    ],
    c: 2,
    x: { de: '„Deep“ bezieht sich auf die vielen Schichten. Jede Schicht erkennt komplexere Muster.', en: '“Deep” refers to the many layers. Each layer detects more complex patterns.' },
  },
  {
    topic: 'genai',
    q: { de: 'Was ist ein „KI-Agent“?', en: 'What is an “AI agent”?' },
    a: [
      { de: 'Ein Geheimdienst-Programm', en: 'A secret service program' },
      { de: 'Ein Antivirenprogramm', en: 'An antivirus program' },
      { de: 'Eine Hotline für KI-Fragen', en: 'A hotline for AI questions' },
      { de: 'Ein KI-System, das selbstständig Schritte plant und Werkzeuge nutzt, um ein Ziel zu erreichen', en: 'An AI system that plans steps on its own and uses tools to reach a goal' },
    ],
    c: 3,
    x: { de: 'Agenten können z. B. recherchieren, Dateien bearbeiten oder Programme bedienen. Menschliche Kontrolle bleibt wichtig.', en: 'Agents can, for example, research, edit files or operate software. Human oversight remains important.' },
  },
].map((item, i) => ({ ...item, id: `q${i}` }));

export const FACT_MYTH = [
  { s: { de: 'KI-Modelle können Fehler machen, die sehr überzeugend klingen.', en: 'AI models can make mistakes that sound very convincing.' }, f: true,
    x: { de: 'Sogenannte Halluzinationen sind ein bekanntes Problem von Sprachmodellen.', en: 'So-called hallucinations are a well-known issue of language models.' } },
  { s: { de: 'Sprachmodelle verstehen Sprache genau so wie Menschen.', en: 'Language models understand language exactly the way humans do.' }, f: false,
    x: { de: 'Sie berechnen statistische Muster in Text. Ob das „Verstehen“ ist, ist umstritten, menschlich ist es nicht.', en: 'They compute statistical patterns in text. Whether that is “understanding” is debated; it is not human.' } },
  { s: { de: 'Ein Sprachmodell durchsucht bei jeder Antwort automatisch das Internet.', en: 'A language model automatically searches the internet for every answer.' }, f: false,
    x: { de: 'Nur wenn eine Suchfunktion angebunden ist. Sonst antwortet es aus seinen Trainingsdaten.', en: 'Only if a search tool is connected. Otherwise it answers from its training data.' } },
  { s: { de: 'KI-Systeme können Vorurteile aus ihren Trainingsdaten übernehmen.', en: 'AI systems can inherit prejudice from their training data.' }, f: true,
    x: { de: 'Einseitige Daten führen zu einseitigen Ergebnissen. Das nennt man Bias.', en: 'One-sided data leads to one-sided results. This is called bias.' } },
  { s: { de: 'Heutige KI hat nachweislich ein eigenes Bewusstsein.', en: 'Today’s AI has been proven to be conscious.' }, f: false,
    x: { de: 'Dafür gibt es keinen wissenschaftlichen Nachweis.', en: 'There is no scientific evidence for this.' } },
  { s: { de: 'KI kann Bilder erzeugen, die von echten Fotos kaum zu unterscheiden sind.', en: 'AI can generate images that are hard to tell apart from real photos.' }, f: true,
    x: { de: 'Bildgeneratoren sind extrem realistisch geworden. Kennzeichnung und Quellenprüfung werden wichtiger.', en: 'Image generators have become extremely realistic. Labeling and source checks matter more.' } },
  { s: { de: 'Mehr Parameter bedeuten automatisch immer ein besseres Modell.', en: 'More parameters automatically always means a better model.' }, f: false,
    x: { de: 'Datenqualität, Training und Architektur sind genauso entscheidend.', en: 'Data quality, training and architecture matter just as much.' } },
  { s: { de: 'Das Training großer KI-Modelle verbraucht viel Energie.', en: 'Training large AI models uses a lot of energy.' }, f: true,
    x: { de: 'Große Trainingsläufe benötigen tausende Spezialchips über Wochen.', en: 'Large training runs need thousands of specialized chips for weeks.' } },
  { s: { de: 'KI-Detektoren erkennen KI-generierte Texte zuverlässig.', en: 'AI detectors reliably identify AI-generated text.' }, f: false,
    x: { de: 'Solche Tools liefern häufig Fehlalarme und lassen sich leicht täuschen.', en: 'Such tools often produce false alarms and are easily fooled.' } },
  { s: { de: 'Machine Learning ist ein Teilgebiet der Künstlichen Intelligenz.', en: 'Machine learning is a subfield of artificial intelligence.' }, f: true,
    x: { de: 'Und Deep Learning ist wiederum ein Teilgebiet des Machine Learning.', en: 'And deep learning is in turn a subfield of machine learning.' } },
  { s: { de: 'Eine KI kann nur genau das, wofür jede Regel einzeln programmiert wurde.', en: 'An AI can only do exactly what every single rule was programmed for.' }, f: false,
    x: { de: 'Moderne KI lernt Muster aus Daten, statt jede Regel explizit vorgegeben zu bekommen.', en: 'Modern AI learns patterns from data instead of being given every rule explicitly.' } },
  { s: { de: 'Sprachmodelle erzeugen Text Stück für Stück (Token für Token).', en: 'Language models generate text piece by piece (token by token).' }, f: true,
    x: { de: 'Sie sagen jeweils das wahrscheinlich nächste Token voraus.', en: 'Each step predicts a likely next token.' } },
  { s: { de: 'Die Idee der KI ist erst in den 2010er-Jahren entstanden.', en: 'The idea of AI only emerged in the 2010s.' }, f: false,
    x: { de: 'Der Begriff stammt von 1956, die Idee ist noch älter (z. B. Alan Turing, 1950).', en: 'The term dates back to 1956, the idea is even older (e.g. Alan Turing, 1950).' } },
  { s: { de: 'Sensible persönliche Daten sollte man nicht unbedacht in KI-Chats eingeben.', en: 'You should not carelessly enter sensitive personal data into AI chats.' }, f: true,
    x: { de: 'Je nach Dienst können Eingaben gespeichert oder ausgewertet werden.', en: 'Depending on the service, inputs may be stored or analyzed.' } },
  { s: { de: 'Die Meta Quest nutzt KI-Methoden für das Hand-Tracking.', en: 'The Meta Quest uses AI methods for hand tracking.' }, f: true,
    x: { de: 'Neuronale Netze erkennen in den Kamerabildern deine Handposition in Echtzeit.', en: 'Neural networks detect your hand pose in the camera images in real time.' } },
  { s: { de: 'Eine KI liefert immer dieselbe Antwort auf dieselbe Frage.', en: 'An AI always gives the same answer to the same question.' }, f: false,
    x: { de: 'Viele Modelle nutzen Zufall beim Generieren, die Antworten variieren daher.', en: 'Many models use randomness when generating, so answers vary.' } },
  { s: { de: 'Ein Sprachmodell verändert durch jedes Gespräch dauerhaft seine Parameter.', en: 'A language model permanently changes its parameters with every conversation.' }, f: false,
    x: { de: 'Im Chat lernt es nicht dauerhaft. Es nutzt nur den aktuellen Kontext. Neue Gewichte gibt es erst durch erneutes Training.', en: 'It does not learn permanently in a chat; it only uses the current context. Weights change only through new training.' } },
  { s: { de: 'Auch KI-generierter Programmcode sollte vor dem Einsatz geprüft werden.', en: 'AI-generated code should also be reviewed before use.' }, f: true,
    x: { de: 'KI-Code kann Fehler oder Sicherheitslücken enthalten, genau wie menschlicher Code.', en: 'AI code can contain bugs or security flaws, just like human code.' } },
  { s: { de: 'Bilderkennung kann durch winzige, für Menschen unsichtbare Pixeländerungen getäuscht werden.', en: 'Image recognition can be fooled by tiny pixel changes that humans cannot see.' }, f: true,
    x: { de: 'Solche „Adversarial Examples“ zeigen, dass KI anders „sieht“ als wir.', en: 'Such “adversarial examples” show that AI “sees” differently than we do.' } },
  { s: { de: 'Neuronale Netze sind exakte Nachbildungen des menschlichen Gehirns.', en: 'Neural networks are exact replicas of the human brain.' }, f: false,
    x: { de: 'Sie sind nur grob inspiriert und funktionieren mathematisch stark vereinfacht.', en: 'They are only loosely inspired and work in a strongly simplified mathematical way.' } },
  { s: { de: 'Die Qualität der Trainingsdaten beeinflusst stark, wie gut ein Modell wird.', en: 'The quality of the training data strongly affects how good a model becomes.' }, f: true,
    x: { de: '„Garbage in, garbage out“: Schlechte Daten führen zu schlechten Ergebnissen.', en: '“Garbage in, garbage out”: bad data leads to bad results.' } },
  { s: { de: 'Es gibt KI-Modelle, die direkt auf dem Smartphone laufen, ohne Cloud.', en: 'There are AI models that run directly on a smartphone, without the cloud.' }, f: true,
    x: { de: 'Kleine, optimierte Modelle laufen lokal, z. B. für Fotos, Diktat oder Übersetzung.', en: 'Small, optimized models run locally, e.g. for photos, dictation or translation.' } },
  { s: { de: 'Wer einen Text mit KI schreibt, muss ihn nicht mehr selbst prüfen.', en: 'If you write a text with AI, you no longer need to check it yourself.' }, f: false,
    x: { de: 'Die Verantwortung für Inhalte bleibt beim Menschen. Fakten, Ton und Quellen gehören geprüft.', en: 'Responsibility for content stays with the human. Facts, tone and sources need checking.' } },
  { s: { de: 'Schachcomputer können seit Ende der 1990er-Jahre auch Weltmeister schlagen.', en: 'Chess computers have been able to beat world champions since the late 1990s.' }, f: true,
    x: { de: '1997 besiegte IBMs Deep Blue Weltmeister Garri Kasparow.', en: 'In 1997 IBM’s Deep Blue beat world champion Garry Kasparov.' } },
  { s: { de: 'Sprachmodelle kennen automatisch alle Ereignisse bis zum heutigen Tag.', en: 'Language models automatically know all events up to today.' }, f: false,
    x: { de: 'Ihr Wissen endet am Trainingsstichtag, außer sie können aktuelle Quellen abrufen.', en: 'Their knowledge ends at the training cutoff, unless they can access current sources.' } },
  { s: { de: 'Der EU AI Act gilt nur für Unternehmen mit Sitz in der EU.', en: 'The EU AI Act only applies to companies based in the EU.' }, f: false,
    x: { de: 'Er gilt auch für Anbieter von außerhalb, wenn ihre KI-Systeme in der EU genutzt werden.', en: 'It also applies to providers outside the EU if their AI systems are used in the EU.' } },
].map((item, i) => ({ ...item, id: `f${i}` }));

// Each round: 3 categories; every term has a category index and a short explanation.
export const SORT_ROUNDS = [
  {
    title: { de: 'Lernarten', en: 'Learning types' },
    cats: [
      { de: 'Überwachtes Lernen', en: 'Supervised learning' },
      { de: 'Unüberwachtes Lernen', en: 'Unsupervised learning' },
      { de: 'Bestärkendes Lernen', en: 'Reinforcement learning' },
    ],
    terms: [
      { t: { de: 'Spamfilter mit markierten E-Mails', en: 'Spam filter from labeled emails' }, c: 0,
        x: { de: 'Jede Trainings-Mail trägt das Label „Spam“ oder „kein Spam“.', en: 'Every training email carries the label “spam” or “not spam”.' } },
      { t: { de: 'Tierfotos mit Beschriftung', en: 'Animal photos with captions' }, c: 0,
        x: { de: 'Die Beschriftung ist die richtige Antwort, aus der das Modell lernt.', en: 'The caption is the correct answer the model learns from.' } },
      { t: { de: 'Kundengruppen selbst finden', en: 'Finding customer groups' }, c: 1,
        x: { de: 'Clustering: Das Modell gruppiert ähnliche Kunden ohne vorgegebene Antworten.', en: 'Clustering: the model groups similar customers without given answers.' } },
      { t: { de: 'Auffällige Muster ohne Labels', en: 'Unusual patterns, no labels' }, c: 1,
        x: { de: 'Anomalie-Erkennung findet Ausreißer, ohne dass jemand sie vorher markiert.', en: 'Anomaly detection finds outliers without anyone marking them first.' } },
      { t: { de: 'Roboter lernt Laufen per Belohnung', en: 'Robot learns to walk via rewards' }, c: 2,
        x: { de: 'Jeder stabile Schritt wird belohnt, jedes Hinfallen bestraft.', en: 'Every stable step is rewarded, every fall penalized.' } },
      { t: { de: 'Schach-KI spielt gegen sich selbst', en: 'Chess AI plays against itself' }, c: 2,
        x: { de: 'Gewinnen ist die Belohnung. So lernt die KI Millionen Partien lang.', en: 'Winning is the reward, so the AI learns over millions of games.' } },
    ],
  },
  {
    title: { de: 'Anwendungsfelder', en: 'Application fields' },
    cats: [
      { de: 'Sprache', en: 'Language' },
      { de: 'Bild & Video', en: 'Image & video' },
      { de: 'Audio', en: 'Audio' },
    ],
    terms: [
      { t: { de: 'Automatische Übersetzung', en: 'Machine translation' }, c: 0,
        x: { de: 'Übersetzung ist eine klassische Aufgabe der Sprachverarbeitung (NLP).', en: 'Translation is a classic natural language processing (NLP) task.' } },
      { t: { de: 'Chatbot im Kundenservice', en: 'Customer service chatbot' }, c: 0,
        x: { de: 'Chatbots verstehen und erzeugen Text mit Sprachmodellen.', en: 'Chatbots understand and generate text with language models.' } },
      { t: { de: 'Röntgenbilder auswerten', en: 'Analyzing X-ray images' }, c: 1,
        x: { de: 'Computer Vision hilft Ärztinnen und Ärzten, Auffälligkeiten zu entdecken.', en: 'Computer vision helps doctors spot abnormalities.' } },
      { t: { de: 'Hand-Tracking der Quest', en: 'Quest hand tracking' }, c: 1,
        x: { de: 'Die Kameras der Quest liefern Bilder, aus denen KI deine Handhaltung berechnet.', en: 'The Quest cameras deliver images from which AI computes your hand pose.' } },
      { t: { de: 'Sprache in Text umwandeln', en: 'Speech to text' }, c: 2,
        x: { de: 'Spracherkennung analysiert das Audiosignal und macht daraus Text.', en: 'Speech recognition analyzes the audio signal and turns it into text.' } },
      { t: { de: 'Musik generieren', en: 'Generating music' }, c: 2,
        x: { de: 'Generative Audiomodelle erzeugen neue Klänge und Melodien.', en: 'Generative audio models create new sounds and melodies.' } },
    ],
  },
  {
    title: { de: 'Chancen & Risiken', en: 'Opportunities & risks' },
    cats: [
      { de: 'Chance', en: 'Opportunity' },
      { de: 'Risiko', en: 'Risk' },
      { de: 'Schutzmaßnahme', en: 'Safeguard' },
    ],
    terms: [
      { t: { de: 'Schnellere Diagnosen in der Medizin', en: 'Faster medical diagnoses' }, c: 0,
        x: { de: 'KI kann Bilder in Sekunden vorsortieren und so Fachkräfte entlasten.', en: 'AI can pre-sort images in seconds and relieve specialists.' } },
      { t: { de: 'Automatische Untertitel', en: 'Automatic captions' }, c: 0,
        x: { de: 'Mehr Barrierefreiheit für Menschen mit Hörbeeinträchtigung.', en: 'More accessibility for people with hearing impairments.' } },
      { t: { de: 'Täuschend echte Deepfakes', en: 'Convincing deepfakes' }, c: 1,
        x: { de: 'Gefälschte Videos können Menschen täuschen und Vertrauen zerstören.', en: 'Fake videos can deceive people and destroy trust.' } },
      { t: { de: 'Unfaire Entscheidungen durch Bias', en: 'Unfair decisions due to bias' }, c: 1,
        x: { de: 'Verzerrte Daten können z. B. Bewerbungen ungerecht bewerten.', en: 'Skewed data can, for example, rate job applications unfairly.' } },
      { t: { de: 'Mensch prüft KI-Entscheidungen', en: 'Human reviews AI decisions' }, c: 2,
        x: { de: '„Human in the Loop“ hält Verantwortung beim Menschen.', en: '“Human in the loop” keeps responsibility with people.' } },
      { t: { de: 'KI-Inhalte kennzeichnen', en: 'Labeling AI content' }, c: 2,
        x: { de: 'Kennzeichnung schafft Transparenz und erschwert Täuschung.', en: 'Labeling creates transparency and makes deception harder.' } },
    ],
  },
  {
    title: { de: 'Der Weg eines KI-Modells', en: 'The life of an AI model' },
    cats: [
      { de: 'Daten', en: 'Data' },
      { de: 'Training', en: 'Training' },
      { de: 'Einsatz', en: 'Deployment' },
    ],
    terms: [
      { t: { de: 'Bilder beschriften lassen', en: 'Labeling images' }, c: 0,
        x: { de: 'Ohne gute Labels kann ein überwachtes Modell nicht lernen.', en: 'Without good labels a supervised model cannot learn.' } },
      { t: { de: 'Datensatz bereinigen', en: 'Cleaning a dataset' }, c: 0,
        x: { de: 'Doppelte oder fehlerhafte Einträge werden vor dem Training entfernt.', en: 'Duplicate or faulty entries are removed before training.' } },
      { t: { de: 'Gewichte anpassen', en: 'Adjusting weights' }, c: 1,
        x: { de: 'Das ist der Kern des Trainings: Gewichte werden Schritt für Schritt verbessert.', en: 'This is the core of training: weights are improved step by step.' } },
      { t: { de: 'Fehler pro Durchlauf senken', en: 'Reducing the error each pass' }, c: 1,
        x: { de: 'Mit jedem Durchlauf (Epoche) sollte der Fehler auf Testdaten sinken.', en: 'With each pass (epoch) the error on test data should drop.' } },
      { t: { de: 'Chatbot beantwortet Kundenfragen', en: 'Chatbot answers customers' }, c: 2,
        x: { de: 'Im Einsatz nutzt das fertige Modell sein Wissen, es lernt dabei nicht weiter.', en: 'In deployment the finished model uses what it learned; it does not keep learning.' } },
      { t: { de: 'Modell in eine App einbauen', en: 'Building a model into an app' }, c: 2,
        x: { de: 'Erst im Einsatz entsteht Nutzen für Menschen, und Verantwortung.', en: 'Only in deployment does it benefit people, and bring responsibility.' } },
    ],
  },
  {
    title: { de: 'Generative KI erzeugt …', en: 'Generative AI creates …' },
    cats: [
      { de: 'Text', en: 'Text' },
      { de: 'Bild', en: 'Image' },
      { de: 'Code', en: 'Code' },
    ],
    terms: [
      { t: { de: 'E-Mail-Entwurf schreiben', en: 'Drafting an email' }, c: 0,
        x: { de: 'Sprachmodelle formulieren Entwürfe, die du anpasst und prüfst.', en: 'Language models write drafts that you adapt and check.' } },
      { t: { de: 'Bericht zusammenfassen', en: 'Summarizing a report' }, c: 0,
        x: { de: 'Zusammenfassen spart Zeit. Wichtige Details trotzdem gegenlesen.', en: 'Summaries save time; still double-check important details.' } },
      { t: { de: 'Logo-Ideen generieren', en: 'Generating logo ideas' }, c: 1,
        x: { de: 'Bildmodelle erzeugen Entwürfe aus einer Textbeschreibung.', en: 'Image models create drafts from a text description.' } },
      { t: { de: 'Hintergrund eines Fotos ändern', en: 'Changing a photo background' }, c: 1,
        x: { de: 'Generative Bildbearbeitung ergänzt oder ersetzt Bildbereiche.', en: 'Generative image editing fills in or replaces image areas.' } },
      { t: { de: 'Funktion in Python schreiben', en: 'Writing a Python function' }, c: 2,
        x: { de: 'Code-Assistenten schreiben Programme. Testen bleibt Pflicht.', en: 'Coding assistants write programs; testing remains a must.' } },
      { t: { de: 'Fehler im Programm finden', en: 'Finding a bug in a program' }, c: 2,
        x: { de: 'KI kann Fehlermeldungen erklären und Lösungen vorschlagen.', en: 'AI can explain error messages and suggest fixes.' } },
    ],
  },
];
SORT_ROUNDS.forEach((r, ri) => r.terms.forEach((term, ti) => { term.id = `s${ri}-${ti}`; }));

// Milestones for the timeline mode. Rounds reference event ids; years within a round are unique.
export const EVENTS = [
  { y: 1950, t: { de: 'Alan Turing schlägt den Turing-Test vor', en: 'Alan Turing proposes the Turing test' },
    x: { de: 'In „Computing Machinery and Intelligence“ fragt Turing: Können Maschinen denken?', en: 'In “Computing Machinery and Intelligence” Turing asks: can machines think?' } },
  { y: 1956, t: { de: 'Dartmouth-Konferenz prägt den Begriff „KI“', en: 'Dartmouth workshop coins the term “AI”' },
    x: { de: 'Die Geburtsstunde der KI als Forschungsfeld.', en: 'The birth of AI as a research field.' } },
  { y: 1958, t: { de: 'Das Perzeptron, ein frühes neuronales Netz', en: 'The perceptron, an early neural network' },
    x: { de: 'Frank Rosenblatt baut ein lernfähiges künstliches Neuron.', en: 'Frank Rosenblatt builds an artificial neuron that can learn.' } },
  { y: 1966, t: { de: 'ELIZA, einer der ersten Chatbots', en: 'ELIZA, one of the first chatbots' },
    x: { de: 'Joseph Weizenbaums Programm imitierte eine Gesprächstherapie mit einfachen Regeln.', en: 'Joseph Weizenbaum’s program imitated a therapist using simple rules.' } },
  { y: 1986, t: { de: 'Backpropagation wird populär', en: 'Backpropagation becomes popular' },
    x: { de: 'Mit diesem Verfahren lassen sich mehrschichtige Netze effizient trainieren.', en: 'This method makes it possible to train multi-layer networks efficiently.' } },
  { y: 1997, t: { de: 'Deep Blue schlägt Schachweltmeister Kasparow', en: 'Deep Blue beats chess champion Kasparov' },
    x: { de: 'Erstmals verliert ein amtierender Weltmeister ein Match gegen einen Computer.', en: 'For the first time a reigning world champion loses a match to a computer.' } },
  { y: 2011, t: { de: 'IBM Watson gewinnt die Quizshow „Jeopardy!“', en: 'IBM Watson wins the quiz show “Jeopardy!”' },
    x: { de: 'Watson verstand knifflige Quizfragen in natürlicher Sprache.', en: 'Watson understood tricky quiz questions in natural language.' } },
  { y: 2012, t: { de: 'AlexNet gewinnt den ImageNet-Wettbewerb', en: 'AlexNet wins the ImageNet competition' },
    x: { de: 'Der Startschuss für den Deep-Learning-Boom in der Bilderkennung.', en: 'The starting signal for the deep learning boom in image recognition.' } },
  { y: 2014, t: { de: 'GANs: zwei Netze erzeugen neue Bilder', en: 'GANs: two networks create new images' },
    x: { de: 'Ian Goodfellow lässt einen Generator und einen Prüfer gegeneinander antreten.', en: 'Ian Goodfellow pits a generator against a discriminator.' } },
  { y: 2016, t: { de: 'AlphaGo besiegt Lee Sedol im Go', en: 'AlphaGo defeats Lee Sedol at Go' },
    x: { de: 'Go galt als zu komplex für Computer, bis bestärkendes Lernen den Durchbruch brachte.', en: 'Go was considered too complex for computers until reinforcement learning broke through.' } },
  { y: 2017, t: { de: 'Die Transformer-Architektur wird vorgestellt', en: 'The transformer architecture is introduced' },
    x: { de: 'Das Paper „Attention Is All You Need“ legt die Basis für heutige Sprachmodelle.', en: 'The paper “Attention Is All You Need” lays the foundation for today’s language models.' } },
  { y: 2018, t: { de: 'Das erste GPT-Modell erscheint', en: 'The first GPT model is released' },
    x: { de: 'Vortrainieren auf viel Text, dann anpassen: das GPT-Prinzip.', en: 'Pretrain on lots of text, then adapt: the GPT principle.' } },
  { y: 2020, t: { de: 'AlphaFold 2 sagt Proteinstrukturen voraus', en: 'AlphaFold 2 predicts protein structures' },
    x: { de: 'Ein jahrzehntealtes Biologie-Problem wird weitgehend gelöst. 2024 gab es dafür den Chemie-Nobelpreis.', en: 'A decades-old biology problem is largely solved; it earned the 2024 Nobel Prize in Chemistry.' } },
  { y: 2022, t: { de: 'ChatGPT wird veröffentlicht', en: 'ChatGPT is released' },
    x: { de: 'Innerhalb weniger Wochen nutzen Millionen Menschen einen KI-Chatbot.', en: 'Within weeks millions of people use an AI chatbot.' } },
  { y: 2023, t: { de: 'Die Meta Quest 3 kommt mit Farb-Passthrough', en: 'Meta Quest 3 launches with color passthrough' },
    x: { de: 'Mixed Reality für zu Hause, mit KI-gestütztem Hand-Tracking.', en: 'Mixed reality at home, with AI-powered hand tracking.' } },
  { y: 2024, t: { de: 'Der EU AI Act tritt in Kraft', en: 'The EU AI Act enters into force' },
    x: { de: 'Das weltweit erste umfassende KI-Gesetz, mit Regeln je nach Risiko.', en: 'The world’s first comprehensive AI law, with rules based on risk.' } },
].map((e, i) => ({ ...e, id: `e${i}` }));

export const TIMELINE_ROUNDS = [
  ['e0', 'e1', 'e3', 'e5'],
  ['e2', 'e4', 'e7', 'e10'],
  ['e5', 'e6', 'e9', 'e12'],
  ['e8', 'e11', 'e13', 'e15'],
  ['e1', 'e7', 'e13', 'e14'],
];

// ---------- Sponsor bonus content (Echomotion GmbH) ----------
// One bonus item appears per round with double points. Not part of the learning progress.

// ---------- KI-Lab images (3D viewer) ----------
// pano: 360° equirectangular image shown as a sphere; otherwise a curved screen with the given aspect.
// src loads first (4K, fast); srcHi (8K) replaces it on devices that can handle it.
// Yaw that puts the horizontal center of an equirectangular image in front of the player.
const LOOK_AT_CENTER = -Math.PI / 2;

export const LAB_IMAGES = [
  { src: 'assets/lab/pano-stage-4k.jpg', srcHi: 'assets/lab/pano-stage-8k.jpg', thumb: 'assets/lab/pano-stage-thumb.jpg', pano: true, yaw: LOOK_AT_CENTER,
    caption: { de: 'Workshop-Bühne mit Sitzstufen', en: 'Workshop stage with tiered seating' } },
  { src: 'assets/lab/pano-desks-4k.jpg', srcHi: 'assets/lab/pano-desks-8k.jpg', thumb: 'assets/lab/pano-desks-thumb.jpg', pano: true, yaw: LOOK_AT_CENTER,
    caption: { de: 'Arbeitsplätze im KI-Lab', en: 'Workstations in the AI lab' } },
  { src: 'assets/lab/pano-lounge-4k.jpg', srcHi: 'assets/lab/pano-lounge-8k.jpg', thumb: 'assets/lab/pano-lounge-thumb.jpg', pano: true, yaw: LOOK_AT_CENTER,
    caption: { de: 'Ruheraum im Wald-Look', en: 'Forest-themed quiet room' } },
];

// ---------- Robot game (reinforcement learning) ----------
// Grid cells are [x, z]: x 0..6 left to right, z 0 (far) .. 6 (near the player).
export const ROBOT_LEVELS = [
  {
    title: { de: 'Level 1: Erste Schritte', en: 'Level 1: First steps' },
    intro: {
      de: 'Das ist Echo, unser Maskottchen. Echo weiß noch nichts über die Welt. Es probiert zufällig aus und bekommt +10 Punkte, wenn es die Münze erreicht. Starte das Training und schau zu, wie es dazulernt.',
      en: 'This is Echo, our mascot. Echo knows nothing about the world yet. It tries things at random and gets +10 points for reaching the coin. Start the training and watch it learn.',
    },
    lesson: {
      de: 'Das ist bestärkendes Lernen: Ausprobieren, Belohnung bekommen, merken, was sich lohnt. Der leuchtende Boden zeigt, wo Echo eine Belohnung erwartet, die Pfeile, wohin es fliegen würde.',
      en: 'This is reinforcement learning: try, get rewarded, remember what pays off. The glowing floor shows where Echo expects a reward, the arrows where it would go.',
    },
    start: [0, 6], goal: [6, 0], walls: [], live: 2, turbo: 60, rule: 'coin',
  },
  {
    title: { de: 'Level 2: Zeig Echo den Weg', en: 'Level 2: Show Echo the way' },
    intro: {
      de: 'Jetzt stehen Mauern im Weg. Du bist der Trainer: Lege mit Pfeilen einen Parkour bis zur Münze. Echo fliegt ihn ab, merkt sich deinen Weg und übt danach alleine weiter.',
      en: 'Now there are walls in the way. You are the trainer: lay out a route to the coin with arrows. Echo flies it, remembers your way and then keeps practicing on its own.',
    },
    lesson: {
      de: 'Das ist Lernen durch Vorführen (Imitation Learning): Ein Mensch zeigt den Weg, die KI übernimmt ihn und verbessert sich danach durch eigenes Üben. So lernen echte Roboter Handgriffe, und auch Sprachmodelle wie ChatGPT oder Claude lernen zuerst aus Beispielen von Menschen.',
      en: 'This is learning from demonstration (imitation learning): a human shows the way, the AI adopts it and then improves by practicing on its own. That is how real robots learn tasks, and language models like ChatGPT or Claude also first learn from examples written by humans.',
    },
    start: [0, 6], goal: [6, 0], walls: [[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [2, 1], [3, 1], [4, 1], [5, 1]], live: 0, turbo: 30, rule: 'coin', plan: true,
  },
  {
    title: { de: 'Level 3: Die Belohnungs-Falle', en: 'Level 3: The reward trap' },
    intro: {
      de: 'Jetzt entscheidest du, wofür Echo Punkte bekommt. Wähle eine Belohnungsregel und schau, was Echo daraus macht.',
      en: 'Now you decide what Echo earns points for. Pick a reward rule and see what Echo makes of it.',
    },
    start: [0, 6], goal: [6, 0], walls: [[3, 2], [3, 3], [3, 4]], live: 0, turbo: 80, choose: true,
  },
];

export const ROBOT_RULES = [
  { key: 'coin', label: { de: 'Münze erreichen: +10', en: 'Reach the coin: +10' },
    result: { de: 'Funktioniert. Echo findet den Weg, braucht aber einige Versuche, weil es die Belohnung erst ganz am Ende gibt.', en: 'It works. Echo finds the way, but needs quite a few attempts because the reward only comes at the very end.' } },
  { key: 'steps', label: { de: 'Fleißpunkte: +1 für jeden Schritt, +10 für die Münze', en: 'Effort points: +1 per step, +10 for the coin' },
    result: { de: 'Echo sammelt lieber Fleißpunkte und fliegt im Kreis, statt die Münze zu holen. Es tut genau das, was belohnt wird, nicht das, was du gemeint hast.', en: 'Echo would rather collect effort points and fly in circles than fetch the coin. It does exactly what is rewarded, not what you meant.' } },
  { key: 'shaping', label: { de: 'Näher zur Münze: +0,5, weiter weg: −0,5, Münze: +10', en: 'Closer to the coin: +0.5, further away: −0.5, coin: +10' },
    result: { de: 'Am schnellsten. Kleine Zwischenbelohnungen weisen Echo den Weg. Gutes Belohnungsdesign entscheidet, ob eine KI das Richtige lernt.', en: 'The fastest. Small intermediate rewards show Echo the way. Good reward design decides whether an AI learns the right thing.' } },
];

export const ROBOT_FINAL = {
  title: { de: 'Trainer-Diplom: Du hast eine KI trainiert', en: 'Trainer diploma: you trained an AI' },
  lessons: {
    de: 'Bestärkendes Lernen: Belohnung statt Regeln.\nLernen durch Vorführen: Menschen zeigen den Weg, die KI übt weiter.\nReward Hacking: KI optimiert, was du belohnst, nicht, was du meinst.',
    en: 'Reinforcement learning: rewards instead of rules.\nLearning from demonstration: humans show the way, the AI keeps practicing.\nReward hacking: AI optimizes what you reward, not what you mean.',
  },
};

export const SPONSOR = {
  name: 'Echomotion',
  tagline: 'AI Trainings & More',
  url: 'https://www.echomotion.ai',
  domain: 'www.echomotion.ai',
  presentedBy: { de: 'Präsentiert von Echomotion GmbH', en: 'Presented by Echomotion GmbH' },
  offer: { de: 'KI-Beratung · KI-Lösungen · KI-Trainings', en: 'AI consulting · AI solutions · AI trainings' },
  cta: {
    de: 'Lust auf mehr KI-Wissen? Echomotion bringt KI mit Trainings und Beratung in dein Team.',
    en: 'Want more AI know-how? Echomotion brings AI to your team with trainings and consulting.',
  },
};

export const SPONSOR_QUIZ = [
  {
    topic: 'sponsor',
    q: { de: 'Wer präsentiert diese AR-Experience?', en: 'Who presents this AR experience?' },
    a: [
      { de: 'Echomotion GmbH', en: 'Echomotion GmbH' },
      { de: 'Ein Toaster mit WLAN', en: 'A toaster with Wi-Fi' },
      { de: 'ELIZA, der Chatbot von 1966', en: 'ELIZA, the 1966 chatbot' },
      { de: 'Der Turing-Test persönlich', en: 'The Turing test itself' },
    ],
    c: 0,
    x: { de: 'Echomotion ist eine KI-Beratung und bietet KI-Lösungen und KI-Trainings.', en: 'Echomotion is an AI consultancy offering AI solutions and AI trainings.' },
  },
  {
    topic: 'sponsor',
    q: { de: 'Was bietet Echomotion an?', en: 'What does Echomotion offer?' },
    a: [
      { de: 'Wettervorhersagen für den Mars', en: 'Weather forecasts for Mars' },
      { de: 'KI-Beratung, KI-Lösungen und KI-Trainings', en: 'AI consulting, AI solutions and AI trainings' },
      { de: 'Schachunterricht für Roboter', en: 'Chess lessons for robots' },
      { de: 'Nur sehr guten Kaffee', en: 'Only very good coffee' },
    ],
    c: 1,
    x: { de: 'Von der Strategie über die Umsetzung bis zum Training: Echomotion begleitet Teams auf dem Weg zu KI.', en: 'From strategy to implementation to training: Echomotion supports teams on their AI journey.' },
  },
  {
    topic: 'sponsor',
    q: { de: 'Was ist der beste nächste Schritt nach diesem Quiz?', en: 'What is the best next step after this quiz?' },
    a: [
      { de: 'Die Quest im Schrank verstecken', en: 'Hide the Quest in a closet' },
      { de: 'Dem Toaster Programmieren beibringen', en: 'Teach the toaster to code' },
      { de: 'Das Wissen im Team vertiefen, z. B. mit einem KI-Training', en: 'Deepen the knowledge in your team, e.g. with an AI training' },
      { de: 'Nie wieder über KI nachdenken', en: 'Never think about AI again' },
    ],
    c: 2,
    x: { de: 'In KI-Trainings von Echomotion wird aus Quizwissen echte Praxis im Arbeitsalltag.', en: 'In Echomotion’s AI trainings, quiz knowledge turns into real everyday practice.' },
  },
].map((item, i) => ({ ...item, id: `b${i}`, bonus: true }));

export const SPONSOR_FM = [
  { s: { de: 'Diese AR-Experience wird von Echomotion präsentiert, einer KI-Beratung.', en: 'This AR experience is presented by Echomotion, an AI consultancy.' }, f: true,
    x: { de: 'Echomotion bietet KI-Beratung, KI-Lösungen und KI-Trainings.', en: 'Echomotion offers AI consulting, AI solutions and AI trainings.' } },
  { s: { de: 'Echomotion bietet ausschließlich Schachunterricht für Roboter an.', en: 'Echomotion offers nothing but chess lessons for robots.' }, f: false,
    x: { de: 'Ganz klar ein Mythos: Echomotion macht KI-Beratung, KI-Lösungen und KI-Trainings, für Menschen.', en: 'Clearly a myth: Echomotion does AI consulting, AI solutions and AI trainings, for humans.' } },
  { s: { de: 'Bei Echomotion kann man KI-Trainings für sein Team buchen.', en: 'You can book AI trainings for your team at Echomotion.' }, f: true,
    x: { de: 'Genau dafür ist Echomotion da: KI verständlich machen und praktisch anwenden.', en: 'That is exactly what Echomotion is for: making AI understandable and practical.' } },
].map((item, i) => ({ ...item, id: `bf${i}`, bonus: true }));

export const SPONSOR_SORT_ROUND = {
  bonus: true,
  title: { de: 'Echomotion-Bonusrunde', en: 'Echomotion bonus round' },
  cats: [
    { de: 'KI-Beratung', en: 'AI consulting' },
    { de: 'KI-Lösungen', en: 'AI solutions' },
    { de: 'KI-Trainings', en: 'AI trainings' },
  ],
  terms: [
    { t: { de: 'KI-Strategie entwickeln', en: 'Developing an AI strategy' }, c: 0,
      x: { de: 'Beratung klärt: Wo bringt KI im Unternehmen wirklich etwas?', en: 'Consulting clarifies where AI really adds value in a company.' } },
    { t: { de: 'Passende Einsatzfälle finden', en: 'Finding the right use cases' }, c: 0,
      x: { de: 'Gute Beratung beginnt beim Problem, nicht beim Tool.', en: 'Good consulting starts with the problem, not the tool.' } },
    { t: { de: 'Eigenen KI-Assistenten umsetzen', en: 'Building your own AI assistant' }, c: 1,
      x: { de: 'Eine KI-Lösung macht aus der Idee ein funktionierendes System.', en: 'An AI solution turns the idea into a working system.' } },
    { t: { de: 'Abläufe mit KI automatisieren', en: 'Automating workflows with AI' }, c: 1,
      x: { de: 'Wiederkehrende Aufgaben übernimmt die KI, das Team gewinnt Zeit.', en: 'AI takes over repetitive tasks and the team gains time.' } },
    { t: { de: 'Prompting-Workshop fürs Team', en: 'Prompting workshop for the team' }, c: 2,
      x: { de: 'Im Training lernt man, gute Prompts zu schreiben und Ergebnisse zu prüfen.', en: 'In training you learn to write good prompts and check results.' } },
    { t: { de: 'Mitarbeitende fit für KI machen', en: 'Getting employees AI-ready' }, c: 2,
      x: { de: 'KI wirkt erst, wenn Menschen sie sicher und verantwortungsvoll nutzen.', en: 'AI only works when people use it confidently and responsibly.' } },
  ],
};
SPONSOR_SORT_ROUND.terms.forEach((term, ti) => { term.id = `bs${ti}`; });

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- converters: any learning item -> multiple choice question ----------

const FACT = { de: 'Fakt', en: 'Fact' };
const MYTH = { de: 'Mythos', en: 'Myth' };
const byId = new Map();
QUIZ.forEach((q) => byId.set(q.id, () => q));
FACT_MYTH.forEach((f) => byId.set(f.id, () => ({
  id: f.id,
  topic: 'myth',
  q: { de: `Fakt oder Mythos? ${f.s.de}`, en: `Fact or myth? ${f.s.en}` },
  a: [FACT, MYTH],
  c: f.f ? 0 : 1,
  x: f.x,
})));
SORT_ROUNDS.forEach((r) => r.terms.forEach((term) => byId.set(term.id, () => ({
  id: term.id,
  topic: 'concepts',
  q: { de: `Wozu gehört „${term.t.de}“? (${r.title.de})`, en: `Where does “${term.t.en}” belong? (${r.title.en})` },
  a: r.cats,
  c: term.c,
  x: term.x,
}))));
EVENTS.forEach((e) => byId.set(e.id, () => {
  const others = shuffle(EVENTS.filter((o) => o.y !== e.y).sort((a, b) => Math.abs(a.y - e.y) - Math.abs(b.y - e.y)).slice(0, 6));
  const years = [e.y, ...others.slice(0, 3).map((o) => o.y)];
  const a = years.map((y) => ({ de: String(y), en: String(y) }));
  return {
    id: e.id,
    topic: 'history',
    q: { de: `In welchem Jahr? ${e.t.de}`, en: `In which year? ${e.t.en}` },
    a,
    c: 0,
    x: e.x,
  };
}));

/** Returns a multiple choice version of any item id (or null). */
export function toMC(id) {
  return byId.get(id)?.() ?? null;
}

export const ALL_IDS = [...byId.keys()];

// AI Pong opponents: game characters with simplified values (not benchmarks).
// reaction: seconds the AI needs to re-plan, speed: paddle speed (m/s), error: aiming
// error (m). Profiles: Claude most precise but slower to react and move, GPT reacts early
// and moves fast but is imprecise, Gemini has the shortest latency, medium speed, rather
// imprecise. ratings (1-5) are what the selection cards show. ease overrides the global
// ease-up of the scene (see PONG_EASE in scenes/pong.js).
export const PONG_OPPONENTS = [
  { key: 'gpt', name: 'GPT-6.1', reaction: 0.14, speed: 1.25, error: 0.09, ratings: { reaction: 4, speed: 5, precision: 2 }, token: 'xr-pong-opp-gpt' },
  { key: 'gemini', name: 'Gemini 4', reaction: 0.07, speed: 1.05, error: 0.08, ratings: { reaction: 5, speed: 3, precision: 2 }, token: 'xr-pong-opp-gemini' },
  // The nemesis: always the last opponent of a tournament and only slightly eased.
  { key: 'claude', name: 'Claude Opus 5.5', reaction: 0.22, speed: 0.95, error: 0.015, ratings: { reaction: 2, speed: 2, precision: 5 }, token: 'xr-pong-opp-claude', boss: true,
    ease: { speed: 0.95, reaction: 0.02, catchError: 0.8, misjudge: 0.04, randomAim: 0.3 } },
];

// ---------- Walkable architecture: "Bank data landscape" (scenes/arch.js) ----------
// Zones are placed on a ring around the player; the data platform floats above the center.
// angle: direction of the zone (0 = in front, clockwise in radians), r: radius factor.
export const ARCH_ZONES = [
  { key: 'src', angle: 0, r: 1, token: 'xr-arch-src', name: { de: 'Quellsysteme', en: 'Source systems' } },
  { key: 'int', angle: 1.15, r: 1, token: 'xr-arch-int', name: { de: 'Integration', en: 'Integration' } },
  { key: 'ana', angle: 2.3, r: 1, token: 'xr-arch-ana', name: { de: 'Analytik & KI', en: 'Analytics & AI' } },
  { key: 'reg', angle: 3.45, r: 1, token: 'xr-arch-reg', name: { de: 'Meldewesen & Steuerung', en: 'Reporting & steering' } },
  { key: 'gov', angle: 4.6, r: 1, token: 'xr-arch-gov', name: { de: 'Governance & Sicherheit', en: 'Governance & security' } },
  { key: 'ext', angle: 5.55, r: 1.45, token: 'xr-arch-ext', name: { de: 'Externe Partner', en: 'External partners' } },
  { key: 'plat', angle: 0, r: 0, token: 'xr-arch-plat', name: { de: 'Datenplattform', en: 'Data platform' } },
];

// type decides the 3D shape: system, app, db, stream, gateway, hex, lake, ai, dashboard,
// report, shield, catalog, lineage, check, external, person, key.
export const ARCH_COMPONENTS = [
  // Source systems
  { id: 'core', zone: 'src', type: 'system', name: { de: 'Kernbankensystem', en: 'Core banking system' }, desc: { de: 'Führt Konten, Buchungen und Salden. Das Herz der Bank, oft noch auf dem Großrechner.', en: 'Keeps accounts, postings and balances. The heart of the bank, often still on a mainframe.' } },
  { id: 'pay', zone: 'src', type: 'system', name: { de: 'Zahlungsverkehr', en: 'Payments' }, desc: { de: 'SEPA-Überweisungen, Lastschriften und Echtzeit-Zahlungen (Instant Payments) in wenigen Sekunden.', en: 'SEPA transfers, direct debits and instant payments within seconds.' } },
  { id: 'loan', zone: 'src', type: 'system', name: { de: 'Kreditsystem', en: 'Lending system' }, desc: { de: 'Kreditanträge, Verträge, Tilgungspläne und Sicherheiten.', en: 'Loan applications, contracts, repayment plans and collateral.' } },
  { id: 'sec', zone: 'src', type: 'system', name: { de: 'Wertpapiere & Depot', en: 'Securities & custody' }, desc: { de: 'Orders, Depots, Kurse und die Abwicklung von Wertpapiergeschäften.', en: 'Orders, custody accounts, prices and settlement of securities trades.' } },
  { id: 'card', zone: 'src', type: 'system', name: { de: 'Kartensystem', en: 'Card system' }, desc: { de: 'Debit- und Kreditkarten, Limits und Autorisierungen beim Bezahlen.', en: 'Debit and credit cards, limits and authorisations at checkout.' } },
  { id: 'crm', zone: 'src', type: 'system', name: { de: 'CRM', en: 'CRM' }, desc: { de: 'Kundenkontakte, Beratungsgespräche und Vertriebschancen.', en: 'Customer contacts, advisory meetings and sales opportunities.' } },
  { id: 'digital', zone: 'src', type: 'app', name: { de: 'Online- & Mobile-Banking', en: 'Online & mobile banking' }, desc: { de: 'App und Website: Hier starten die meisten Kundenaktionen.', en: 'App and website: most customer actions start here.' } },
  { id: 'treasury', zone: 'src', type: 'system', name: { de: 'Treasury & Handel', en: 'Treasury & trading' }, desc: { de: 'Steuert Liquidität und Refinanzierung und führt die Handelsgeschäfte der Bank.', en: 'Manages liquidity and funding and runs the bank’s own trading.' } },
  // External partners
  { id: 'customer', zone: 'ext', type: 'person', name: { de: 'Kundinnen & Kunden', en: 'Customers' }, desc: { de: 'Nutzen App, Filiale und Karte. Jede Aktion erzeugt Daten.', en: 'Use the app, branch and card. Every action creates data.' } },
  { id: 'swift', zone: 'ext', type: 'external', name: { de: 'SWIFT & Clearing', en: 'SWIFT & clearing' }, desc: { de: 'Internationale Zahlungsnachrichten und die Abwicklung zwischen Banken.', en: 'International payment messages and settlement between banks.' } },
  { id: 'bureau', zone: 'ext', type: 'external', name: { de: 'Auskunftei (z. B. SCHUFA)', en: 'Credit bureau' }, desc: { de: 'Liefert Informationen zur Kreditwürdigkeit.', en: 'Provides information on creditworthiness.' } },
  { id: 'market', zone: 'ext', type: 'external', name: { de: 'Marktdaten', en: 'Market data' }, desc: { de: 'Kurse, Zinskurven und Ratings von Datenanbietern.', en: 'Prices, yield curves and ratings from data vendors.' } },
  { id: 'authority', zone: 'ext', type: 'external', name: { de: 'Aufsicht (BaFin, Bundesbank, EZB)', en: 'Supervisors (BaFin, Bundesbank, ECB)' }, desc: { de: 'Empfangen die Pflichtmeldungen der Bank und prüfen sie.', en: 'Receive and check the bank’s mandatory reports.' } },
  // Integration
  { id: 'api', zone: 'int', type: 'gateway', name: { de: 'API-Gateway', en: 'API gateway' }, desc: { de: 'Einheitlicher, abgesicherter Zugang zu Bankfunktionen, auch für Drittanbieter (Open Banking, PSD2).', en: 'Single secured entry to bank functions, also for third parties (open banking, PSD2).' } },
  { id: 'stream', zone: 'int', type: 'stream', name: { de: 'Event-Streaming', en: 'Event streaming' }, desc: { de: 'Verteilt Ereignisse wie Buchungen in Echtzeit an alle Systeme, die sie brauchen.', en: 'Distributes events such as postings in real time to every system that needs them.' } },
  { id: 'cdc', zone: 'int', type: 'hex', name: { de: 'Change Data Capture', en: 'Change data capture' }, desc: { de: 'Erkennt Änderungen in Datenbanken und gibt sie sofort weiter, ohne das Quellsystem zu belasten.', en: 'Detects changes in databases and passes them on at once without loading the source.' } },
  { id: 'etl', zone: 'int', type: 'hex', name: { de: 'ETL-/ELT-Strecken', en: 'ETL/ELT pipelines' }, desc: { de: 'Laden Daten zum Beispiel nachts, bereinigen und verknüpfen sie.', en: 'Load data, for example overnight, then clean and combine it.' } },
  { id: 'mdm', zone: 'int', type: 'db', name: { de: 'Stammdaten (MDM)', en: 'Master data (MDM)' }, desc: { de: 'Eine verlässliche „goldene“ Sicht auf Kunden, Produkte und Geschäftspartner.', en: 'One reliable “golden” view of customers, products and counterparties.' } },
  // Data platform (center, above head height)
  { id: 'lake', zone: 'plat', type: 'lake', name: { de: 'Data Lake (Rohdaten)', en: 'Data lake (raw)' }, desc: { de: 'Speichert alle Daten im Rohformat, günstig und in großen Mengen.', en: 'Stores all data in raw form, cheaply and in large volumes.' } },
  { id: 'lakehouse', zone: 'plat', type: 'lake', name: { de: 'Lakehouse (Bronze, Silber, Gold)', en: 'Lakehouse (bronze, silver, gold)' }, desc: { de: 'Bereinigt und verknüpft die Daten Schicht für Schicht, bis sie geprüft nutzbar sind.', en: 'Cleans and links the data layer by layer until it is verified and usable.' } },
  { id: 'dwh', zone: 'plat', type: 'db', name: { de: 'Data Warehouse', en: 'Data warehouse' }, desc: { de: 'Historisierte, geprüfte Daten für Steuerung und Meldewesen.', en: 'Historised, verified data for steering and regulatory reporting.' } },
  { id: 'vault', zone: 'plat', type: 'db', name: { de: 'Data Vault', en: 'Data vault' }, desc: { de: 'Modelliert Daten so, dass jede Änderung nachvollziehbar bleibt (revisionssicher).', en: 'Models data so that every change stays traceable (audit-proof).' } },
  { id: 'marts', zone: 'plat', type: 'db', name: { de: 'Data Marts', en: 'Data marts' }, desc: { de: 'Zuschnitte für Fachbereiche wie Risiko, Finanzen und Vertrieb.', en: 'Tailored views for departments such as risk, finance and sales.' } },
  { id: 'feature', zone: 'plat', type: 'db', name: { de: 'Feature Store', en: 'Feature store' }, desc: { de: 'Fertig berechnete Merkmale für KI-Modelle, zum Beispiel der durchschnittliche Kontostand.', en: 'Pre-computed features for AI models, for example the average balance.' } },
  { id: 'realtime', zone: 'plat', type: 'stream', name: { de: 'Echtzeit-Analytik', en: 'Real-time analytics' }, desc: { de: 'Wertet Ereignisströme in Millisekunden aus, zum Beispiel für Live-Kennzahlen.', en: 'Analyses event streams within milliseconds, for example for live metrics.' } },
  // Analytics & AI
  { id: 'fraud', zone: 'ana', type: 'ai', name: { de: 'Betrugserkennung (KI)', en: 'Fraud detection (AI)' }, desc: { de: 'Erkennt verdächtige Zahlungen in Echtzeit, bevor das Geld weg ist.', en: 'Spots suspicious payments in real time, before the money is gone.' } },
  { id: 'scoring', zone: 'ana', type: 'ai', name: { de: 'Kredit-Scoring (KI)', en: 'Credit scoring (AI)' }, desc: { de: 'Schätzt das Ausfallrisiko eines Kredits. Muss erklärbar und fair sein.', en: 'Estimates the default risk of a loan. Must be explainable and fair.' } },
  { id: 'nba', zone: 'ana', type: 'ai', name: { de: 'Next Best Offer', en: 'Next best offer' }, desc: { de: 'Schlägt passende Produkte vor, nur mit Einwilligung der Kunden.', en: 'Suggests suitable products, only with customer consent.' } },
  { id: 'bi', zone: 'ana', type: 'dashboard', name: { de: 'BI-Dashboards', en: 'BI dashboards' }, desc: { de: 'Berichte und Kennzahlen für Management und Fachbereiche.', en: 'Reports and KPIs for management and departments.' } },
  { id: 'llm', zone: 'ana', type: 'ai', name: { de: 'KI-Assistent (LLM)', en: 'AI assistant (LLM)' }, desc: { de: 'Beantwortet Fragen von Mitarbeitenden auf Basis freigegebener interner Dokumente.', en: 'Answers staff questions based on approved internal documents.' } },
  // Reporting & steering
  { id: 'report', zone: 'reg', type: 'report', name: { de: 'Meldewesen', en: 'Regulatory reporting' }, desc: { de: 'FINREP, COREP, AnaCredit: Pflichtmeldungen an die Aufsicht.', en: 'FINREP, COREP, AnaCredit: mandatory reports to supervisors.' } },
  { id: 'risk', zone: 'reg', type: 'dashboard', name: { de: 'Risikomanagement', en: 'Risk management' }, desc: { de: 'Kredit-, Markt- und Liquiditätsrisiko (z. B. LCR, NSFR) nach MaRisk.', en: 'Credit, market and liquidity risk (e.g. LCR, NSFR) under MaRisk.' } },
  { id: 'finance', zone: 'reg', type: 'report', name: { de: 'Rechnungswesen', en: 'Accounting' }, desc: { de: 'Bilanz und GuV nach HGB und IFRS.', en: 'Balance sheet and P&L under HGB and IFRS.' } },
  { id: 'controlling', zone: 'reg', type: 'dashboard', name: { de: 'Gesamtbanksteuerung', en: 'Bank steering' }, desc: { de: 'Ertrag, Kosten, Kapital: Wie steht die Bank da und wohin steuert sie?', en: 'Income, costs, capital: where does the bank stand and where is it heading?' } },
  { id: 'aml', zone: 'reg', type: 'shield', name: { de: 'Geldwäscheprävention', en: 'Anti-money laundering' }, desc: { de: 'Prüft Transaktionen auf Auffälligkeiten (AML, KYC) und meldet Verdachtsfälle.', en: 'Screens transactions for anomalies (AML, KYC) and reports suspicious cases.' } },
  // Governance & security
  { id: 'catalog', zone: 'gov', type: 'catalog', name: { de: 'Datenkatalog', en: 'Data catalog' }, desc: { de: 'Verzeichnis aller Datenbestände mit Bedeutung, Verantwortlichen und Qualität.', en: 'Directory of all data sets with meaning, owners and quality.' } },
  { id: 'lineage', zone: 'gov', type: 'lineage', name: { de: 'Data Lineage', en: 'Data lineage' }, desc: { de: 'Zeigt, woher eine Zahl stammt und wohin sie fließt (wichtig für BCBS 239).', en: 'Shows where a number comes from and where it flows (key for BCBS 239).' } },
  { id: 'quality', zone: 'gov', type: 'check', name: { de: 'Datenqualität', en: 'Data quality' }, desc: { de: 'Prüfregeln für Vollständigkeit, Richtigkeit und Aktualität der Daten.', en: 'Rules that check data for completeness, accuracy and timeliness.' } },
  { id: 'iam', zone: 'gov', type: 'shield', name: { de: 'Identitäten & Zugriffe (IAM)', en: 'Identity & access (IAM)' }, desc: { de: 'Wer darf welche Daten sehen? Rollen, Rechte und Zwei-Faktor-Anmeldung.', en: 'Who may see which data? Roles, rights and two-factor login.' } },
  { id: 'crypto', zone: 'gov', type: 'key', name: { de: 'Verschlüsselung (HSM)', en: 'Encryption (HSM)' }, desc: { de: 'Verschlüsselt Daten. Die Schlüssel liegen in Hardware-Sicherheitsmodulen.', en: 'Encrypts data. The keys live in hardware security modules.' } },
  { id: 'consent', zone: 'gov', type: 'shield', name: { de: 'Einwilligungen & DSGVO', en: 'Consent & GDPR' }, desc: { de: 'Verwaltet Einwilligungen, Löschfristen und Auskunftsanfragen.', en: 'Manages consent, deletion periods and access requests.' } },
  { id: 'archive', zone: 'gov', type: 'db', name: { de: 'Archiv & Backup', en: 'Archive & backup' }, desc: { de: 'Revisionssichere Aufbewahrung über viele Jahre und Wiederherstellung im Notfall (DORA).', en: 'Audit-proof retention over many years and recovery in an emergency (DORA).' } },
];

// Data flows: rt = real time, batch, rep = reporting, meta = metadata/governance, sec = security.
export const ARCH_FLOWS = [
  ['customer', 'digital', 'rt'], ['customer', 'card', 'rt'], ['digital', 'api', 'rt'], ['api', 'pay', 'rt'], ['api', 'core', 'rt'],
  ['api', 'iam', 'sec'], ['pay', 'fraud', 'rt'], ['fraud', 'core', 'rt'], ['pay', 'swift', 'rt'], ['card', 'fraud', 'rt'],
  ['card', 'core', 'rt'], ['core', 'cdc', 'rt'], ['cdc', 'stream', 'rt'], ['stream', 'lake', 'rt'], ['stream', 'aml', 'rt'],
  ['stream', 'realtime', 'rt'], ['realtime', 'bi', 'rt'], ['crm', 'loan', 'rt'], ['loan', 'bureau', 'rt'], ['bureau', 'scoring', 'rt'],
  ['scoring', 'core', 'rt'], ['core', 'etl', 'batch'], ['loan', 'etl', 'batch'], ['sec', 'etl', 'batch'], ['card', 'etl', 'batch'],
  ['treasury', 'etl', 'batch'], ['crm', 'etl', 'batch'], ['market', 'sec', 'rt'], ['market', 'treasury', 'rt'], ['market', 'risk', 'batch'],
  ['etl', 'lake', 'batch'], ['lake', 'lakehouse', 'batch'], ['lakehouse', 'vault', 'batch'], ['vault', 'dwh', 'batch'], ['etl', 'dwh', 'batch'],
  ['dwh', 'marts', 'batch'], ['marts', 'risk', 'batch'], ['marts', 'finance', 'batch'], ['marts', 'controlling', 'batch'], ['marts', 'bi', 'batch'],
  ['dwh', 'risk', 'batch'], ['dwh', 'finance', 'batch'], ['lakehouse', 'feature', 'batch'], ['feature', 'fraud', 'batch'], ['feature', 'scoring', 'batch'],
  ['feature', 'nba', 'batch'], ['nba', 'crm', 'rt'], ['mdm', 'core', 'meta'], ['mdm', 'crm', 'meta'], ['mdm', 'dwh', 'meta'],
  ['mdm', 'loan', 'meta'], ['catalog', 'lakehouse', 'meta'], ['catalog', 'dwh', 'meta'], ['catalog', 'llm', 'meta'], ['lineage', 'dwh', 'meta'],
  ['lineage', 'report', 'meta'], ['dwh', 'quality', 'meta'], ['quality', 'report', 'rep'], ['report', 'authority', 'rep'], ['aml', 'authority', 'rep'],
  ['finance', 'report', 'rep'], ['risk', 'controlling', 'rep'], ['controlling', 'bi', 'rep'], ['iam', 'core', 'sec'], ['iam', 'dwh', 'sec'],
  ['iam', 'lakehouse', 'sec'], ['crypto', 'core', 'sec'], ['crypto', 'archive', 'sec'], ['crypto', 'lake', 'sec'], ['consent', 'nba', 'sec'],
  ['consent', 'crm', 'sec'], ['digital', 'consent', 'sec'], ['consent', 'catalog', 'meta'], ['catalog', 'lineage', 'meta'], ['lineage', 'mdm', 'meta'],
  ['core', 'archive', 'batch'], ['dwh', 'archive', 'batch'], ['report', 'archive', 'batch'], ['treasury', 'core', 'rt'], ['archive', 'llm', 'meta'],
];

// Data journeys: find the next station in the room. q = riddle for the next step,
// a = explanation once found. path[0] is the start.
export const ARCH_MISSIONS = [
  {
    id: 'instant',
    title: { de: 'Eine Echtzeit-Überweisung', en: 'An instant transfer' },
    intro: { de: 'Eine Kundin schickt per App 50 Euro an eine Freundin. Folge den Daten durch die Bank.', en: 'A customer sends 50 euros to a friend via the app. Follow the data through the bank.' },
    path: ['digital', 'api', 'pay', 'fraud', 'core', 'cdc', 'stream', 'aml'],
    steps: [
      { q: { de: 'Durch welches Tor kommt die Anfrage der App sicher in die Bank?', en: 'Through which gate does the app’s request enter the bank securely?' }, a: { de: 'Das API-Gateway prüft die Anfrage und leitet sie weiter.', en: 'The API gateway checks the request and forwards it.' } },
      { q: { de: 'Welches System wickelt die Überweisung ab?', en: 'Which system processes the transfer?' }, a: { de: 'Der Zahlungsverkehr startet die Echtzeit-Zahlung.', en: 'Payments starts the instant payment.' } },
      { q: { de: 'Wer prüft in Millisekunden, ob die Zahlung verdächtig ist?', en: 'Who checks within milliseconds whether the payment is suspicious?' }, a: { de: 'Die KI-Betrugserkennung gibt die Zahlung frei.', en: 'The AI fraud detection approves the payment.' } },
      { q: { de: 'Wo wird das Konto belastet und die Buchung festgeschrieben?', en: 'Where is the account debited and the posting recorded?' }, a: { de: 'Das Kernbankensystem bucht die 50 Euro.', en: 'The core banking system posts the 50 euros.' } },
      { q: { de: 'Wer bemerkt die neue Buchung, ohne das Kernbankensystem zu bremsen?', en: 'Who notices the new posting without slowing down the core system?' }, a: { de: 'Change Data Capture greift die Änderung direkt ab.', en: 'Change data capture picks up the change directly.' } },
      { q: { de: 'Wer verteilt das Ereignis in Echtzeit an alle Interessierten?', en: 'Who distributes the event in real time to everyone interested?' }, a: { de: 'Das Event-Streaming verteilt die Buchung.', en: 'Event streaming distributes the posting.' } },
      { q: { de: 'Wer schaut gesetzlich vorgeschrieben auf auffällige Geldflüsse?', en: 'Who is legally required to watch for unusual money flows?' }, a: { de: 'Die Geldwäscheprävention prüft das Muster. Alles unauffällig.', en: 'Anti-money laundering checks the pattern. Nothing unusual.' } },
    ],
  },
  {
    id: 'loan',
    title: { de: 'Ein Kreditantrag', en: 'A loan application' },
    intro: { de: 'Ein Kunde möchte im Beratungsgespräch einen Autokredit. Wohin wandern seine Daten?', en: 'A customer asks for a car loan in an advisory meeting. Where does his data go?' },
    path: ['crm', 'loan', 'bureau', 'scoring', 'core', 'etl', 'dwh', 'risk'],
    steps: [
      { q: { de: 'Wo wird der Antrag mit Betrag, Laufzeit und Sicherheiten erfasst?', en: 'Where is the application with amount, term and collateral recorded?' }, a: { de: 'Das Kreditsystem legt den Antrag an.', en: 'The lending system creates the application.' } },
      { q: { de: 'Wen fragt die Bank nach der Kreditwürdigkeit?', en: 'Whom does the bank ask about creditworthiness?' }, a: { de: 'Die Auskunftei liefert Bonitätsdaten.', en: 'The credit bureau delivers credit data.' } },
      { q: { de: 'Wer schätzt das Ausfallrisiko und muss erklären können, warum?', en: 'Who estimates the default risk and must be able to explain why?' }, a: { de: 'Das Kredit-Scoring empfiehlt: genehmigen.', en: 'Credit scoring recommends: approve.' } },
      { q: { de: 'Wo wird die Auszahlung gebucht?', en: 'Where is the payout posted?' }, a: { de: 'Das Kernbankensystem bucht den Kredit.', en: 'The core banking system posts the loan.' } },
      { q: { de: 'Wer holt den neuen Kredit über Nacht aus dem Kernbankensystem?', en: 'Who extracts the new loan from the core system overnight?' }, a: { de: 'Die ETL-Strecken laden den Kredit.', en: 'The ETL pipelines load the loan.' } },
      { q: { de: 'Wo landet der Kredit historisiert für Auswertungen?', en: 'Where does the loan end up historised for analysis?' }, a: { de: 'Das Data Warehouse speichert den Kredit dauerhaft.', en: 'The data warehouse stores the loan for good.' } },
      { q: { de: 'Wer bewertet, wie riskant das gesamte Kreditbuch jetzt ist?', en: 'Who assesses how risky the whole loan book is now?' }, a: { de: 'Das Risikomanagement rechnet das Kreditrisiko neu.', en: 'Risk management recalculates the credit risk.' } },
    ],
  },
  {
    id: 'report',
    title: { de: 'Die Monatsmeldung an die Aufsicht', en: 'The monthly report to the supervisor' },
    intro: { de: 'Monatsende: Die Bank muss ihre Zahlen an die Aufsicht melden. Korrekt, vollständig, pünktlich.', en: 'Month end: the bank must report its figures to the supervisor. Correct, complete, on time.' },
    path: ['core', 'etl', 'dwh', 'quality', 'report', 'authority'],
    steps: [
      { q: { de: 'Wer holt die Buchungen über Nacht aus dem Kernbankensystem?', en: 'Who extracts the postings from the core system overnight?' }, a: { de: 'Die ETL-Strecken laden und bereinigen die Daten.', en: 'The ETL pipelines load and clean the data.' } },
      { q: { de: 'Wo werden die geprüften Daten historisiert abgelegt?', en: 'Where is the verified data stored historised?' }, a: { de: 'Das Data Warehouse hält den Monatsstand.', en: 'The data warehouse holds the month-end state.' } },
      { q: { de: 'Wer prüft, ob die Zahlen vollständig und richtig sind?', en: 'Who checks whether the figures are complete and correct?' }, a: { de: 'Die Datenqualität findet und meldet Lücken.', en: 'Data quality finds and flags gaps.' } },
      { q: { de: 'Wer erstellt FINREP, COREP und AnaCredit?', en: 'Who produces FINREP, COREP and AnaCredit?' }, a: { de: 'Das Meldewesen erzeugt die Meldungen.', en: 'Regulatory reporting creates the reports.' } },
      { q: { de: 'Wohin geht die fertige Meldung?', en: 'Where does the finished report go?' }, a: { de: 'Die Aufsicht erhält die Meldung pünktlich.', en: 'The supervisor receives the report on time.' } },
    ],
  },
  {
    id: 'gdpr',
    title: { de: 'Eine DSGVO-Auskunft', en: 'A GDPR access request' },
    intro: { de: 'Eine Kundin will wissen, welche Daten die Bank über sie speichert. Die Bank muss das schnell beantworten.', en: 'A customer wants to know what data the bank holds about her. The bank must answer quickly.' },
    path: ['digital', 'consent', 'catalog', 'lineage', 'mdm'],
    steps: [
      { q: { de: 'Wer nimmt Auskunftsanfragen und Einwilligungen entgegen?', en: 'Who receives access requests and consent?' }, a: { de: 'Das DSGVO-Management startet die Auskunft.', en: 'GDPR management starts the request.' } },
      { q: { de: 'Wo steht, in welchen Datenbeständen Kundendaten liegen?', en: 'Where is it recorded which data sets contain customer data?' }, a: { de: 'Der Datenkatalog listet alle betroffenen Bestände.', en: 'The data catalog lists all affected data sets.' } },
      { q: { de: 'Wer zeigt, wohin die Daten weitergeflossen sind?', en: 'Who shows where the data has flowed to?' }, a: { de: 'Die Data Lineage verfolgt jeden Fluss.', en: 'Data lineage traces every flow.' } },
      { q: { de: 'Wo liegt die eine, „goldene“ Sicht auf die Kundin?', en: 'Where is the single “golden” view of the customer?' }, a: { de: 'Die Stammdaten liefern den vollständigen Kundendatensatz.', en: 'Master data delivers the complete customer record.' } },
    ],
  },
];

// ---------- AI arena (scenes/fight.js) ----------
// Original robot opponents. predict: how often the AI counters the move it expects from you,
// special: chance to use its special when the energy bar is full, hp: health,
// dmg: damage factor of its hits, taken: damage factor of your hits on it.
export const FIGHT_OPPONENTS = [
  { key: 'volt', name: 'VOLT-7', style: 'light', token: 'xr-fight-volt', specialMove: 'shock', hp: 85, predict: 0.35, special: 0.5, dmg: 0.9, taken: 1.1 },
  { key: 'granit', name: 'GRANIT', style: 'heavy', token: 'xr-fight-granit', specialMove: 'boulder', hp: 110, predict: 0.6, special: 0.7, dmg: 1.1, taken: 0.95 },
  { key: 'omega', name: 'OMEGA', style: 'boss', token: 'xr-fight-omega', specialMove: 'laser', hp: 125, predict: 0.82, special: 0.9, dmg: 1.2, taken: 0.9, boss: true },
];

// Datenflug: the data that flies towards Echo. Good data fills the database, bad data must be
// dodged (it deletes part of the database). name: label on the data, why: what it means
// (shown when bad data hits Echo and in the results).
export const FLIGHT_GOOD = [
  { key: 'checked', name: { de: 'Geprüft', en: 'Verified' }, why: { de: 'Jemand hat die Werte kontrolliert. So lernt die KI aus Fakten statt aus Fehlern.', en: 'Someone checked the values, so the AI learns from facts instead of mistakes.' } },
  { key: 'current', name: { de: 'Aktuell', en: 'Up to date' }, why: { de: 'Der Stand von heute: Die KI antwortet passend zur Gegenwart.', en: 'Today’s state: the AI answers in line with the present.' } },
  { key: 'complete', name: { de: 'Vollständig', en: 'Complete' }, why: { de: 'Alle wichtigen Felder sind gefüllt, die KI muss nichts raten.', en: 'All important fields are filled, the AI does not have to guess.' } },
  { key: 'labeled', name: { de: 'Beschriftet', en: 'Labeled' }, why: { de: 'Beispiele mit der richtigen Antwort dran: So lernt ein Modell beim überwachten Lernen.', en: 'Examples with the right answer attached: that is how a model learns in supervised learning.' } },
  { key: 'balanced', name: { de: 'Ausgewogen', en: 'Balanced' }, why: { de: 'Alle Gruppen sind fair vertreten, das Modell behandelt alle gleich.', en: 'All groups are fairly represented, so the model treats everyone alike.' } },
  { key: 'consent', name: { de: 'Mit Einwilligung', en: 'With consent' }, why: { de: 'Die Menschen haben zugestimmt, die Nutzung ist erlaubt.', en: 'People agreed, so using the data is allowed.' } },
  { key: 'source', name: { de: 'Bekannte Quelle', en: 'Known source' }, why: { de: 'Man weiß, woher die Daten kommen, und kann sie nachprüfen.', en: 'You know where the data comes from and can check it.' } },
];

export const FLIGHT_BAD = [
  { key: 'dup', name: { de: 'Duplikat', en: 'Duplicate' }, why: { de: 'Derselbe Datensatz mehrfach: Zählungen und Statistiken werden verzerrt.', en: 'The same record more than once: counts and statistics get skewed.' } },
  { key: 'old', name: { de: 'Veraltet', en: 'Outdated' }, why: { de: 'Alte Preise oder Adressen: Die KI lernt einen Stand, der nicht mehr stimmt.', en: 'Old prices or addresses: the AI learns a state that is no longer true.' } },
  { key: 'error', name: { de: 'Fehlerhaft', en: 'Faulty' }, why: { de: 'Tippfehler und falsche Werte: Was schlecht hineingeht, kommt schlecht heraus.', en: 'Typos and wrong values: garbage in, garbage out.' } },
  { key: 'gap', name: { de: 'Lückenhaft', en: 'Incomplete' }, why: { de: 'Fehlende Felder: Die KI muss raten, wo Werte fehlen.', en: 'Missing fields: the AI has to guess where values are missing.' } },
  { key: 'bias', name: { de: 'Verzerrt', en: 'Biased' }, why: { de: 'Nur eine Gruppe ist vertreten: Das Modell benachteiligt alle anderen.', en: 'Only one group is represented: the model is unfair to everyone else.' } },
  { key: 'consent', name: { de: 'Ohne Einwilligung', en: 'No consent' }, why: { de: 'Personendaten ohne Erlaubnis: Die Nutzung kann gegen die DSGVO verstoßen.', en: 'Personal data without permission: using it can break the GDPR.' } },
  { key: 'source', name: { de: 'Quelle unbekannt', en: 'Unknown source' }, why: { de: 'Herkunft unklar: Niemand kann prüfen, ob die Daten stimmen.', en: 'Unclear origin: nobody can check whether the data is right.' } },
  { key: 'spam', name: { de: 'Spam', en: 'Spam' }, why: { de: 'Werbemüll und Bot-Texte verwässern alles, was die KI lernt.', en: 'Junk ads and bot texts water down everything the AI learns.' } },
];

// Datenflug: what the hackers fire at Echo (a hit deletes part of the database). The labels
// fly with the attacks; what hit you is explained.
export const FLIGHT_ATTACKS = [
  { key: 'phishing', name: { de: 'Phishing', en: 'Phishing' }, why: { de: 'Gefälschte Nachrichten wollen an Passwörter und Zugangsdaten. Erst prüfen, dann klicken.', en: 'Fake messages are after passwords and logins. Check first, then click.' } },
  { key: 'malware', name: { de: 'Schadsoftware', en: 'Malware' }, why: { de: 'Schadprogramme schleichen sich ins System und stehlen oder verändern Daten.', en: 'Malicious programs sneak into the system and steal or change data.' } },
  { key: 'ransomware', name: { de: 'Ransomware', en: 'Ransomware' }, why: { de: 'Verschlüsselt die Daten und verlangt Lösegeld. Aktuelle Backups retten dich.', en: 'Encrypts the data and demands a ransom. Up-to-date backups save you.' } },
  { key: 'poisoning', name: { de: 'Data Poisoning', en: 'Data poisoning' }, why: { de: 'Manipulierte Trainingsdaten bringen der KI absichtlich Falsches bei.', en: 'Manipulated training data deliberately teaches the AI the wrong things.' } },
  { key: 'injection', name: { de: 'Prompt Injection', en: 'Prompt injection' }, why: { de: 'Versteckte Befehle in Texten oder Webseiten sollen eine KI zu etwas Falschem bringen.', en: 'Hidden instructions in texts or web pages try to make an AI do the wrong thing.' } },
];
