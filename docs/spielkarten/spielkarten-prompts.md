# Spielkarten: Bild-Prompts / Game cards: image prompts

KI-Wissen AR by Echomotion. Ein Bild pro Spiel für die Spielkarten im Menü. / One image per game for the game cards in the menu.

## Münz-Stil für das Menü (aktuell) / Coin style for the menu (current)

**DE:** Das Menü zeigt jedes Spiel als 3D-Münze. Fertig sind Echo-Parkour (`vorlage-parkour.webp`), KI-Pong (`vorlage-pong.jpg`), Datenflug (`vorlage-arch.jpg`, im Spiel `dataflight`), KI-Arena (`vorlage-fight.jpg`) und KI-Quiz (`vorlage-quiz.jpg`). Für Fakt oder Mythos: Lade das Echo-Referenzbild **und** eine der fertigen Münzen (z. B. `vorlage-pong.jpg`) als Stil-Referenz hoch, dann wird der Rahmen gleich. Die App schneidet nur das Bild innerhalb des gemalten Rahmens aus (`scripts/coin-face.py`), der Rahmen kommt als echtes 3D-Metall dazu. Der Titel darf deutsch im Bild stehen; halte ihn kurz, damit er nicht in den Rahmen läuft.

**EN:** The menu shows every game as a 3D coin. Done: Echo Parkour (`vorlage-parkour.webp`), AI Pong (`vorlage-pong.jpg`), Data Flight (`vorlage-arch.jpg`, game `dataflight`), AI Arena (`vorlage-fight.jpg`) and AI Quiz (`vorlage-quiz.jpg`). For Fact or Myth: upload the Echo reference image **and** one of the finished coins (e.g. `vorlage-pong.jpg`) as a style reference, so the frame matches. The app only cuts out the picture inside the painted frame (`scripts/coin-face.py`); the frame is added as real 3D metal. The title may be German in the image; keep it short so it does not run into the frame.

**Vorlage / Template (DE):** Runder Spiele-Button als Münze, quadratisches Bild 1:1, Münze mittig auf hellem, fast weißem Hintergrund mit weichem Schatten. Glänzender metallischer Rahmen mit Verlauf von Türkis zu Violett, genau wie in der Stil-Referenz. Innen eine bunte, fröhliche Szene im Look eines hochwertigen 3D-Cartoon-Mobile-Games mit Neon-Akzenten. Oben im Bild große, fette, gelbe 3D-Buchstaben mit dunkler Kontur: „[TITEL]“. Echo (siehe Referenzbild) ist die Hauptfigur. Szene: [SZENE]

**Template (EN):** Round game button as a coin, square image 1:1, the coin centered on a light, almost white background with a soft shadow. Glossy metallic frame with a turquoise to violet gradient, exactly as in the style reference. Inside, a colorful, cheerful scene in the look of a premium 3D cartoon mobile game with neon accents. At the top of the image big, bold, yellow 3D letters with a dark outline: "[TITLE]". Echo (see the reference image) is the main character. Scene: [SCENE]

| Spiel / Game | Datei / File | [TITEL] | [SZENE] (DE) | [SCENE] (EN) |
|---|---|---|---|---|
| Datenhaushalt Bank | `karte-arch` | DATEN-REISE | Echo fliegt neugierig über eine kleine leuchtende Bank-Stadt aus Servern, Datenbank-Zylindern und einem Bankgebäude mit Säulen; leuchtende Datenbahnen mit Lichtpaketen in Türkis, Gelb und Violett verbinden alles. | Echo flies curiously over a small glowing bank city of servers, database cylinders and a bank building with columns; glowing data tracks with light packets in turquoise, yellow and violet connect everything. |
| KI-Quiz | `karte-quiz` | KI-QUIZ | Echo schwebt stolz neben einem kleinen, halb gebauten Haus auf einer schwebenden Rasen-Insel, um sie herum leuchtende Antwortkarten und eine Glühbirne, dahinter ein Sternenhimmel aus verbundenen Lichtpunkten wie ein neuronales Netz. | Echo hovers proudly next to a small, half-built house on a floating grass island, glowing answer cards and a light bulb around them, behind them a starry sky of connected light dots like a neural network. |
| Fakt oder Mythos | `karte-factmyth` | FAKT ODER MYTHOS | Echo als kleiner Detektiv mit Lupe; links ein klar leuchtender grüner Edelstein mit Häkchen-Glanz (Fakt), rechts ein comichaftes Roboter-Hologramm mit riesigem Gehirn, das in violette Pixel zerfällt (Mythos). | Echo as a little detective with a magnifying glass; on the left a clearly glowing green gem (fact), on the right a cartoonish robot hologram with a huge brain dissolving into violet pixels (myth). |

Neue Bilder einbauen / Adding new images: `python3 scripts/coin-face.py <bild> <spiel>` (z. B. `arch`, `quiz`, `factmyth`), dann den Schlüssel in `CARD_ART` in `public/js/menu-coins.js` eintragen. / then add the key to `CARD_ART` in `public/js/menu-coins.js`.

## Querformat-Karten (Alternative) / Landscape cards (alternative)

Die folgenden Prompts sind der erste Entwurf für Karten im Querformat im dunklen App-Stil. / The prompts below are the first draft for landscape cards in the dark app style.

## So gehst du vor / How to use

**DE**
1. Lade `echo-referenz-front.png` (und gern zusätzlich `echo-referenz-dreiviertel.png`) im Bildgenerator als Referenz- oder Charakterbild hoch. So sieht Echo auf allen Karten gleich aus. `echo-referenz-front-transparent.png` ist dieselbe Ansicht ohne Hintergrund, falls dein Werkzeug das besser verarbeitet.
2. Prompt zusammensetzen: **Stil-Block + Echo-Block + Szene** des Spiels, dazu den **Negativ-Prompt** (falls dein Werkzeug ein eigenes Feld dafür hat; sonst mit „Vermeide:“ anhängen).
3. Format: Querformat 3:2, mindestens 1536 × 1024 Pixel, PNG oder JPG.
4. Dateien so benennen und mir schicken: `karte-parkour`, `karte-parkour2`, `karte-pong`, `karte-arch`, `karte-fight`, `karte-quiz`, `karte-factmyth`. Ich verkleinere sie für die Quest und baue die Karten (Titel zweisprachig von der App, nicht im Bild).
5. Das Abzeichen auf Echos Bauch geben Bildgeneratoren oft verzerrt wieder. Dann in den Echo-Block „ein schlichtes rundes dunkelblaues Abzeichen ohne Symbol“ schreiben.

**EN**
1. Upload `echo-referenz-front.png` (and ideally `echo-referenz-dreiviertel.png` as well) to the image generator as a reference or character image, so Echo looks the same on every card. `echo-referenz-front-transparent.png` is the same view without a background, in case your tool handles that better.
2. Build the prompt: **style block + Echo block + scene** of the game, plus the **negative prompt** (if your tool has a field for it; otherwise append it as "Avoid:").
3. Format: landscape 3:2, at least 1536 × 1024 pixels, PNG or JPG.
4. Name the files like this and send them to me: `karte-parkour`, `karte-parkour2`, `karte-pong`, `karte-arch`, `karte-fight`, `karte-quiz`, `karte-factmyth`. I resize them for the Quest and build the cards (titles come bilingual from the app, not in the image).
5. Image generators often garble the badge on Echo's belly. In that case write "a plain round dark-navy badge without a symbol" in the Echo block.

## Stil-Block / Style block (für alle Karten / for all cards)

**DE:** Illustration für eine Spielkarte, Querformat 3:2. Hochwertiger stilisierter 3D-Render im Look einer edlen Designer-Vinylfigur: Soft-Touch-Oberflächen mit leichtem Klarlack-Glanz, runde, freundliche Formen. Weiches, filmisches Studiolicht mit kühlem cyanfarbenem Gegenlicht. Tiefer nachtblauer Hintergrund (#070a14 bis #0d1222) mit sanftem Leuchten, Neon-Akzente in Violett (#7c5cff), Cyan (#5ad8ff), Bernstein (#ffb02e) und Mint (#2fcf8a). Geringe Tiefenschärfe. Hauptmotiv mittig mit etwas Luft zum Rand; das untere Viertel ruhiger und dunkler (Platz für den Titel). Kein Text, keine Buchstaben, keine Zahlen, keine Logos, kein Wasserzeichen, keine Bedienoberfläche.

**EN:** Game card illustration, landscape 3:2. High-end stylized 3D render in the look of a premium designer vinyl toy: soft-touch materials with a light clear-coat sheen, rounded friendly shapes. Soft cinematic studio lighting with a cool cyan rim light. Deep night-blue background (#070a14 to #0d1222) with a subtle glow, neon accents in violet (#7c5cff), cyan (#5ad8ff), amber (#ffb02e) and mint (#2fcf8a). Shallow depth of field. Main subject centered with breathing room; the lower quarter of the image calmer and darker (space for a title). No text, no letters, no numbers, no logos, no watermark, no user interface.

## Echo-Block / Echo block

**DE:** Echo, das Maskottchen (siehe Referenzbild): eine niedliche, kugelrunde Fledermaus mit glänzendem Körper in Blau mit Verlauf von Violett oben links zu Cyanblau unten rechts, hohe spitze Ohren mit Lavendel-Innenohr, große runde weiße Augen mit großen tief-indigofarbenen Pupillen, dunkelblauem Iris-Ring und zwei weißen Lichtpunkten, kleine dunkle Nase, kleines Lächeln, zartrosa Wangen, hellblauer Bauchfleck mit kleinem rundem dunkelblauem Abzeichen, Lavendel-Fledermausflügel mit je drei bogenförmigen Spitzen, kleine Füße mit runden Zehen und zwei cyanfarbene Bögen, die über dem Kopf zwischen den Ohren schweben wie Signalwellen.

**EN:** Echo, the mascot (see the reference image): a cute, chubby round bat with a glossy body in blue with a gradient from violet at the top left to cyan-blue at the bottom right, tall pointed ears with lavender inner ears, big round white eyes with large dark-indigo pupils, a navy iris ring and two white highlights, a small dark nose, a tiny smile, faint pink cheeks, a light blue belly patch with a small round dark-navy badge, lavender bat wings with three scalloped points each, small feet with round toes, and two cyan arcs floating above the head between the ears like signal waves.

## Negativ-Prompt / Negative prompt

**DE:** Text, Buchstaben, Wörter, Zahlen, Logos, Markennamen, Wasserzeichen, Signatur, Bedienoberfläche, fotorealistische Menschen, gruselig, Horror, zusätzliche Gliedmaßen, zusätzliche Flügel, zusätzliche Augen, verformt, unscharf, kontrastarm, matschige Farben

**EN:** text, letters, words, numbers, logos, brand names, watermark, signature, user interface, photorealistic people, scary, horror, extra limbs, extra wings, extra eyes, deformed, blurry, low contrast, muddy colors

## Szenen / Scenes

### 1. Echo-Parkour, Level 1: Server-Parcours / Echo Parkour, level 1: server parkour (`karte-parkour`)

**DE:** Szene: Echo springt mit ausgebreiteten Flügeln über einen schwebenden Miniatur-Parcours aus kompakten Server-Rack-Plattformen mit segmentierten Deckplatten, kleinen Bolzen und leuchtend cyanfarbenen Lichtkanten. Echo greift nach einer sich drehenden goldenen Münze mit geriffeltem Rand. Darunter in einer Lücke: ein rot leuchtender Kristall (ein Glitch) und eine kleine käferförmige Roboter-Drohne mit schillerndem Panzer und flatternden Flügeln. Im Hintergrund eine Skyline aus hohen Server-Türmen mit winzigen blinkenden Lichtern, die ins Dunkel übergeht. Dynamische diagonale Komposition mit einer Spur kleiner Lichtfunken hinter Echo.

**EN:** Scene: Echo leaps through the air with wings spread above a floating miniature parkour course made of chunky server-rack platforms with segmented top plates, small bolts and glowing cyan light edges. Echo reaches for a spinning golden coin with a reeded edge. Below in a gap: a glowing red crystal (a glitch) and a small beetle-shaped robot drone with an iridescent shell and fluttering wings. In the background a skyline of tall server towers with tiny blinking lights, fading into the dark. Dynamic diagonal composition with a trail of small light sparks behind Echo.

### 2. Echo-Parkour, Level 2: Büro-Flug / Echo Parkour, level 2: office flight (`karte-parkour2`)

**DE:** Szene: Echo fliegt fröhlich durch ein gemütliches, modernes Großraumbüro in der Abenddämmerung, seitlich gesehen wie ein Miniatur-Diorama. Holzschreibtische mit Monitoren, die ein abstraktes Chat-Layout aus farbigen Sprechblasen zeigen (kein lesbarer Text), Bürostühle, ein Bücherregal mit bunten Büchern, eine Topfpflanze, eine Kaffeemaschine auf einer Küchentheke und warmweiße Hängelampen. Große Fenster zeigen eine Stadt-Skyline unter einem Abendhimmel von Violett bis Bernstein. Auf dem Boden ein Kabelsalat mit kleinen hellen Funken, unter der Decke eine kleine käferförmige Roboter-Drohne, direkt vor Echo schwebt eine goldene Münze.

**EN:** Scene: Echo flies cheerfully through a cozy modern open-plan office at dusk, seen from the side like a miniature diorama. Wooden desks with monitors showing an abstract chat layout made of colored bubbles (no readable text), office chairs, a bookshelf with colorful books, a potted plant, a coffee machine on a kitchen counter and warm white pendant lamps. Large windows show a city skyline under a violet-to-amber evening sky. On the floor a tangle of cables with small bright sparks, near the ceiling a small beetle-shaped robot drone, a golden coin floating just ahead of Echo.

### 3. KI-Pong / AI Pong (`karte-pong`)

**DE:** Szene: ein dreidimensionales Pong-Match in einem Neon-Tunnel aus leuchtenden rechteckigen Rahmen, die in die Tiefe führen. Im Vordergrund ein durchscheinender cyanfarbener Glasschläger, ein heller weißer Ball mit Lichtspur fliegt zum fernen Ende, wo ein magenta-violetter Gegnerschläger vor einem wirbelnden Energiestrudel wartet. Feiner Regen aus winzigen leuchtenden Punkten an den Tunnelwänden. Echo schwebt am Rand des Tunneleingangs und feuert mit erhobenen Flügeln an.

**EN:** Scene: a three-dimensional pong match inside a neon tunnel made of glowing rectangular frames receding into the depth. In the foreground a translucent cyan glass paddle, a bright white ball with a light trail flying toward the far end, where a magenta-violet opponent paddle waits in front of a swirling energy vortex. Faint rain of tiny glowing dots on the tunnel walls. Echo hovers at the edge of the tunnel entrance and cheers with raised wings.

### 4. Datenhaushalt Bank / Bank data landscape (`karte-arch`)

**DE:** Szene: eine isometrische Miniatur-Datenlandschaft einer Bank auf dunklem Boden. Kleine leuchtende Module im Kreis angeordnet: Server-Blöcke, Datenbank-Zylinder, ein klassisches Bankgebäude mit Säulen, ein Schild für Sicherheit, ein Stapel Dokumente für das Meldewesen. Sie sind durch leuchtende Bögen verbunden, auf denen kleine Lichtpakete in Cyan, Bernstein, Mint und Violett wandern. In der Mitte schwebt ein Stapel durchscheinender, leuchtender Scheiben als Datenplattform. Echo fliegt über der Szene und folgt neugierig einem der Lichtpakete.

**EN:** Scene: an isometric miniature data landscape of a bank on a dark floor. Small glowing modules arranged in a circle: server blocks, database cylinders, a classic bank building with columns, a shield for security, a stack of documents for reporting. They are connected by luminous arcs with small light packets traveling along them in cyan, amber, mint and violet. In the center floats a stack of translucent glowing disks as the data platform. Echo flies above the scene and curiously follows one of the light packets.

### 5. KI-Arena / AI Arena (`karte-fight`)

**DE:** Szene: ein runder holografischer Spieltisch mit Mittelkreis und zwei Ringen aus abwechselnden Segmenten, getrennt durch leuchtende Linien, mit dickem Metallrand und kleinen Lichtern. Darauf stehen sich zwei Hologramm-Kämpfer gegenüber: Echo in Kampfhaltung, einen Flügel als Schild erhoben, aus den Bögen über dem Kopf pulsiert ein cyanfarbener Sonar-Ring, und ein kantiger humanoider Roboter mit bernsteinfarben leuchtenden Augen in Kampfstellung. Beide Figuren im kühlen blauen Hologramm-Look mit Scanlines, Leuchtkanten und leichter Transparenz. Energiefunken zwischen ihnen, verspielt statt brutal.

**EN:** Scene: a round holographic game table with a center circle and two rings of alternating segments separated by glowing lines, a thick metal rim with small lights. On it two hologram fighters face each other: Echo in a fighting pose, one wing raised as a shield, a cyan sonar ring pulsing from the arcs above its head, and an angular humanoid robot with amber glowing eyes in a combat stance. Both figures have a cool blue hologram look with scanlines, glowing edges and slight transparency. Sparks of energy between them, playful rather than violent.

### 6. KI-Quiz / AI Quiz (`karte-quiz`)

**DE:** Szene: Echo schwebt stolz neben einem charmanten kleinen Haus auf einer schwebenden Rasen-Insel. Das Haus ist halb fertig: auf einer Seite fertige Wände und Fenster, auf der anderen ein Holzgerüst und ein halb gedecktes Dach, auf dem Dach eine kleine schlichte violette Fahne. Um sie herum schweben ein paar leuchtende, leere Antwortkarten und eine kleine leuchtende Glühbirne. Im dunklen Himmel dahinter ein Sternbild aus leuchtenden Punkten, verbunden durch feine Linien wie ein neuronales Netz.

**EN:** Scene: Echo hovers proudly next to a charming little house on a floating grass island. The house is half built: finished walls and windows on one side, wooden scaffolding and a partly tiled roof on the other, a small plain violet flag on the roof. Around them float a few glowing blank answer cards and a small glowing light bulb. In the dark sky behind them a constellation of glowing dots connected by thin lines like a neural network.

### 7. Fakt oder Mythos / Fact or Myth (`karte-factmyth`)

**DE:** Szene: Echo als kleiner Detektiv mit Lupe schwebt in der Mitte und untersucht zwei schwebende Dinge. Links ein massiver, kristallklarer mintgrüner Edelstein, der ruhig leuchtet (der Fakt). Rechts ein comichaftes Roboter-Hologramm mit übergroßem leuchtendem Gehirn, das Risse bekommt und in violette Pixel und Rauchschwaden zerfällt (der Mythos). Geteiltes Licht: klares Mint-Licht links, flackerndes violettes Licht rechts.

**EN:** Scene: Echo as a little detective with a magnifying glass hovers in the middle and examines two floating things. On the left a solid, crystal-clear mint-green gem that glows steadily (the fact). On the right a cartoonish robot hologram with an oversized glowing brain that is cracking and dissolving into violet pixels and wisps of smoke (the myth). Split lighting: clean mint light on the left, flickering violet light on the right.
