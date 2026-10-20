# Änderungen

## 3.0.1 — 2026-10-20 — Symbole in edu-sharing

Gehört zum Agenten 3.0.1. Attribute, Ereignisse und Ansichten wie in 3.0.0.

- **Symbole ohne Icon-Schrift des Widgets:** edu-sharing lädt nur
  `runtime.js`, `polyfills.js` und `main.js`, nicht `styles.css` (sein eigenes
  Stylesheet bleibt so ungestört); es gilt seine Icon-Schrift (Material Symbols).
  Die Outlined-Schrift des Widgets kam dort nie an, und statt ⊗ stand der
  Ligaturtext („Vorlesung ca“); `info_outline` (Leerzustand, Info-Meldungen) kennt
  Material Symbols nicht. Beide sind jetzt eingebettete SVGs
  (`shared/svg-icon`); `material-icons-outlined.woff2` wird nicht mehr
  ausgeliefert. Alle übrigen Icon-Namen sind gegen die Schrift von edu-sharing
  geprüft. Betraf 2.1.1 genauso.
- **Hinweis für Einbettende, ohne Änderung am Widget:** Setzt der Host `layout`
  usw. erst, nachdem das Element im DOM hängt und registriert ist, zeigt das
  Widget bis dahin das Standard-Layout mit Texteingabefeld (meist Millisekunden,
  bei beschäftigter Seite 1–2 s; in edu-sharing beobachtet, betraf 2.1.1
  genauso). Korrigierte Einbindung: README, „Einbettung in edu-sharing“.

## 3.0.0 — 2026-10-17 — Neuer Aufbau, Korrekturen aus dem Audit

Gehört zum Agenten 3.0.0. Attribute, Ereignisse und Ansichten sind dieselben
wie in 2.1.1. Im Verhalten weicht 3.0.0 an einigen Stellen bewusst ab; sie sind
unten als **Abweichung von 2.1.1** markiert (u. a. Import ohne `metadataset`,
Inhalt von Ereignissen und Upload). Das Bundle meldet 3.0.0 und lädt seine
Texte als `/widget/i18n/<sprache>.json?v=3.0.0`.

Sichtbar anders als in 2.1.1: die Basisfelder heißen „Basis“ statt „Core“, die
zusammengefasste Gruppe bei `flat-groups` „Alle Felder“; KI-Werte tragen bei
`highlight-ai` ein Symbol; ungültige Felder haben einen roten Rahmen;
Meldungen und Rückfragen erscheinen als Hinweisleiste im Widget statt als
Browser-Dialog; Fehlermeldungen für Datum und Uhrzeit nennen das Format.

Für Einbettende:

- **Widget 3.x braucht Agent 3.x.** Die Texte kommen vom Agenten; ein 3.x-Widget
  an einem 2.x-Agenten (oder umgekehrt) zeigt rohe Schlüssel wie
  `ANNOUNCE.EXTRACTION_STARTED` statt Text. Die Texte von 3.x enthalten weiter
  die Schlüssel, die ein 2.1.1-Widget noch nutzt (z. B. `FIELD.BOOLEAN.EMPTY`).
- **Keine globale Klasse `.visually-hidden` mehr:** das Widget legt sie nicht
  mehr in die Host-Seite. Seiten, die sie für eigene Elemente genutzt haben,
  müssen sie selbst definieren.
- **Version abfragen:** `customElements.get('metadata-agent-canvas').widgetVersion`
  (ein `element.version` gibt es nicht).
- Die Sprache merkt sich das Widget unter `metadata-agent-canvas.language`
  (bisher `app_language`, wird einmal übernommen und nicht gelöscht).

Entwicklungswerkzeuge (19.10.):

- **`uuid` über `sockjs` auf 11.1.1** (`overrides` in `package.json`, vorher
  8.3.2, GHSA-w5hq-g745-h8pq): `sockjs` (im webpack-dev-server von `ng serve`)
  nutzt nur `require('uuid').v4`, das 11.1.1 weiter als CommonJS bietet. Der
  nicht blockierende CI-Job `audit dev dependencies` meldet damit 11 statt 13
  Befunde; übrig ist `braces` (GHSA-vfj7-8cjw-p6xm, ohne korrigierte Version)
  in Karma, chokidar, micromatch und webpack-dev-server. Das ausgelieferte
  Bundle ist nicht betroffen (`npm audit --omit=dev`: 0). Die restlichen
  Befunde entfallen erst mit dem Wechsel auf Vitest und
  `@angular/build:application`.

Korrekturen aus dem finalen Audit vom 18.10.
(`metadata-agent-3/docs/audits/2026-10-18-audit-3.0.0-final.md`):

- **Import beim Seitenstart wie in 2.1.1 (F1):** Ein `metadata-input`, das die
  Seite setzt, während das Widget noch das Basisschema lädt, ging verloren,
  wenn zugleich `content-type` gesetzt war (`review-demo.html`: 0 statt 15
  Felder). Was die Seite setzt, wird jetzt nacheinander angewandt, in der
  Reihenfolge, in der es beim Widget ankommt; ein `content-type`, den der
  Import schon mitbringt, wird nicht erneut angewandt. Nach dem Start wirkt
  `contentType` sofort, `metadataInput` erst mit der nächsten
  Änderungserkennung: `el.metadataInput = …; el.contentType = …` im selben
  Skriptlauf kommt als Typ, dann Import an. Ein Typ hält die Reihe nur auf,
  bis er mit seinen Feldern im Formular steht – nicht für die Neuextraktion,
  die er aus dem Quelltext eines Imports auslöst. Ein `metadata-input`, das
  währenddessen kommt (der Prüftisch geht zum nächsten Node), wird sofort
  angewandt und verwirft deren Ergebnis; vorher wartete es bis zu ~110 s und
  das Ergebnis des vorigen Nodes erschien kurz im Formular.
- **Import ohne `metadataset` behält den Typ der Seite (F2):**
  `el.metadataInput = {...}; el.contentType = 'event.json'` ergibt wieder das
  Veranstaltungsformular mit allen Werten – in beiden Reihenfolgen. Ein Typ
  der vorigen Seite oder Extraktion wird verworfen (keine fremden Felder),
  ebenso der Typ der Seite, sobald der Redakteur selbst einen Typ gewählt hat:
  ein folgender Import ohne `metadataset` hat dann keinen Typ (vorher wurde
  das Formular wieder als Typ der Seite aufgebaut). **Abweichung von 2.1.1:**
  dort behielt ein Import ohne `metadataset` den gerade gewählten Typ, auch
  den der vorigen Seite.
- **Upload folgt dem Formular (W-L1):** Der Upload enthält nur noch Felder des
  Basisschemas und des gewählten Typs, auch die ohne Formularfeld
  (`ask_user: false`, z. B. `schema:geo`, `ccm:oeh_extendedType`) – keine
  Felder eines vorher gewählten Typs, keine Unterfeld-Schlüssel wie
  `schema:location.address.streetAddress`, keine Schlüssel eines Imports, für
  die das Formular kein Feld hat (alles landete in `ccm:oeh_extendedData`).
  `metadataChange`, `metadataSubmit` und der JSON-Download enthalten ebenfalls
  keine Felder eines vorher gewählten Typs und keine Unterfeld-Schlüssel,
  geben aber wie 2.1.1 die Schlüssel des importierten Datensatzes zurück, für
  die das Formular kein Feld hat: unbekannte Schlüssel und die Typwerte eines
  Imports ohne `metadataset` und ohne Typ der Seite (bis zum nächsten Import,
  zur nächsten Extraktion oder zum Zurücksetzen). **Abweichung von 2.1.1:**
  dort enthielten Ereignisse und Upload jeden Schlüssel der internen Liste,
  auch veraltete eines anderen Typs. Entschieden so, weil Einbettende einen
  Datensatz durch das Widget reichen können, ohne fremde Schlüssel ins
  Repository zu schreiben. Die Felder ohne Formularfeld merkt sich jedes
  Widget selbst: ein zweites Widget auf der Seite (`dual-instance-test.html`)
  oder ein neu eingehängtes leerte den gemeinsamen Schemacache, und der
  nächste Upload des ersten verlor z. B. die Geokoordinaten. Setzt ein Widget
  denselben Kontext erneut, bleibt der Cache.
- **Durchtabben verändert Datum mit Uhrzeit nicht mehr:** Ein Wert des
  Agenten mit Sekunden oder Zeitzone (`…T10:00:00`, `…Z`, `…+02:00`) wurde
  beim Verlassen als `…T10:00` gemeldet – Zeitzone weg, KI-Wert als
  Nutzereingabe markiert. Unverändert angezeigt heißt jetzt: keine Meldung.
- **`build-elements.js`:** Scheitert das Schreiben der temporären Bundles
  (volle Platte), werden alle `.tmp`-Dateien entfernt und nichts ersetzt.
  Scheitert das Ersetzen mittendrin, endet das Skript mit Fehler und nennt,
  welche Bundles vom neuen und welche vom alten Build sind. `--target <pfad>`
  (mit Leerzeichen) wirkt wie `--target=<pfad>`; ein unbekanntes Argument
  bricht ab, statt still in das Standardziel (den 2.x-Agenten) zu schreiben.
- **Datum und Uhrzeit werden geprüft (W-L2, W-L3, auch in 2.1.1):** „31.02.2026
  25:99“, „morgen“, „1“ oder „Sommer 2026“ werden abgelehnt und gemeldet statt
  umgerechnet oder still verworfen. Angenommen werden TT.MM.JJJJ, TT/MM/JJJJ und
  ISO, jeweils nur mit existierendem Tag; kein Tagesversatz mehr durch
  Zeitzonen.
- **Zahlen (L-9):** „12abc“ ist keine Zahl mehr, „1.234,5“ wird 1234,5, eine
  Ganzzahl verliert keine Nachkommastellen mehr stillschweigend.
- **Mehrwertige Datums- und Adressfelder (W-L4):** z. B. `schema:url` einer
  Person zeigt die Werte als Chips (auch nur lesend), neue Einträge werden als
  Adresse bzw. Datum geprüft; ein mehrwertiges Datumsfeld wird beim Verlassen
  nicht mehr geleert.
- **Geleerte Werte bleiben leer (W-L5)** nach einem Typwechsel hin und zurück.
- **`content-type="core.json"` (W-L6)** zeigt die Basisfelder einmal statt
  doppelt und setzt keinen Inhaltstyp.
- **Leere Objektfelder (L-8)** (`[]`, `{}`) zählen nicht mehr als ausgefüllt.
- **Schemata (L-11):** ein Typschema wird bei gleichzeitigen Anfragen nur einmal
  geladen, eine Antwort aus einem vorherigen Kontext nicht übernommen, ein
  Feld im Schema seines Typs nachgeschlagen.
- **Barrierefreiheit (U-1, T-2):** Start und Ende einer Extraktion und deren
  Warnungen werden über eine Live-Region angesagt; Extraktions- und
  Upload-Button bleiben während der Extraktion fokussierbar (`aria-disabled`).
  Der Uhr-Button hat einen Namen, das versteckte Eingabefeld der Uhr ist für
  Screenreader verborgen.
- **Upload während einer Extraktion gesperrt (L-10)** – er sendete den Stand
  vor dem Ergebnis.
- **Upload-Fehler nennen den Node:** Antwortet der Agent auf einen
  fehlgeschlagenen Upload mit `node` oder `discarded_node` (422/502), sagt die
  Meldung, ob der Node noch existiert oder entfernt wurde.
- **Texte und Gestaltung (U-2–U-5):** kein englisches „Sub-field of …“ mehr als
  Platzhalter; das Typ-Abzeichen im Standardlayout zeigt den übersetzten
  Typnamen statt eines aus dem Dateinamen gebildeten („Learning Material“);
  Farben über die vorhandenen Variablen; Einblend-Animationen entfallen bei
  `prefers-reduced-motion`; tote Statusanzeigen entfernt.
- **Leistung (P-1):** Das Layout wird nicht mehr bei jedem Änderungszyklus
  geprüft, sondern nur, wenn sich ein gebundener Wert ändert.
- **Sicherheit (S-1, S-2):** Die Standalone-Seite liest `?apiUrl` und
  `?dataUrl` nur noch auf `localhost`; Kontext, Version und Schemadatei werden
  im Pfad escaped.
- **Aufräumen (M-1, M-2):** ungenutzte Methoden (u. a. `validate`,
  `exportMarkdown`, `extractField`, `healthCheck` im API-Dienst) und doppelte
  Logik entfernt, Verhalten unverändert.
- **Doku (D-1):** `docs/URL-PARAMETERS.md` aus dem Code neu geschrieben;
  README-Beispiele korrigiert (`source.json` ist kein Inhaltstyp).
- **Build und Tests:** Größenbudget 1,6 MB Warnung / 2 MB Fehler (gemessen
  1,47 MB); `build-elements.js` schreibt die Bundles unter temporären Namen und
  benennt sie erst am Ende um; CI-Image auf `node:22.20.0-bookworm` festgelegt;
  `@types/node` 22; ngx-translate ohne veraltete Aufrufe; Tests ohne echte
  Wartezeiten, Barrierefreiheitsprüfung mit allen Feldarten.
- **Offen (Schulden):** `@angular/animations` bleibt (ngx-mat-timepicker nutzt
  es); der Wechsel auf `@angular/build:application` bleibt aus (Karma,
  `runtime.js` und `build-elements.js` müssten mitziehen); Chromium im CI ist
  nicht auf eine Version festgelegt.

Korrekturen aus dem Audit vom 18.10. (`metadata-agent/docs/audits/2026-10-18-audit-3.0.0-nachkorrektur.md`):

- **Eingaben während einer Extraktion bleiben (L-01):** Was während eines
  laufenden Laufs in ein Feld eingetragen wird, ersetzt die KI-Antwort nicht
  mehr; das Feld bleibt ein Nutzerwert, auch wenn ein Typwechsel das Formular
  neu aufbaut.
- **Upload (U-02, U-11):** Der Upload-Button ist gesperrt, solange ein Upload
  läuft (kein doppelter Node per Doppelklick). Der wiederholte Upload nach der
  Dubletten-Rückfrage meldet Erfolg oder Fehler. Eine unlesbare JSON-Datei
  wird im Widget gemeldet (übersetzt) statt nur in der Konsole.
- **Sprachwechsel (U-04, U-14):** Feldnamen, Gruppen und Vokabular wechseln die
  Sprache sofort; Datumsangaben erscheinen auf Englisch als TT/MM/JJJJ, die
  Kalenderbeschriftung folgt der Sprache. Die Widget-Wurzel trägt `lang`.
- **Mehrere Elemente einer Instanz (U-07):** Fällt das Element weg, das die
  Ereignisse sendet, übernimmt das nächste – vorher blieben alle stumm.
- **Eingeklappte Gruppen bleiben eingeklappt (U-09)**, auch nach einer
  Extraktion, einer Eingabe oder im Modus `flat-groups`.
- **Text bleibt bei Fehlern (U-10):** Der Beschreibungstext wird erst nach einer
  erfolgreichen Extraktion geleert.
- **Barrierefreiheit (U-12, U-13, U-16):** Pflichtfelder, ungültige Werte und
  der Hinweistext darunter sind programmatisch verknüpft (`aria-required`,
  `aria-invalid`, `aria-describedby`). Das Vorschaubild öffnet per Tastatur,
  der Alt-Text ist übersetzt. KI-Werte sind bei `highlight-ai` auch per Symbol
  und Screenreader-Text markiert. Der Sprachknopf hat einen Namen. Die
  Puls-Animation entfällt bei `prefers-reduced-motion`.
- **Bedienung:** Enter fügt im Beschreibungsfeld eine neue Zeile ein (wurde
  verschluckt); Strg+Enter (Cmd+Enter) startet die Extraktion. Das Zeitfeld
  nimmt getippte Uhrzeiten (HH:MM) an; die Uhr öffnet über den Button.
  Enter in einem Mehrfachfeld (z. B. Schlagwörter) leert das Eingabefeld auch
  dann, wenn es direkt nach dem Tippen kommt; vorher blieb das Wort neben dem
  neuen Chip stehen (bestand schon in 2.1.1).
- **Reflow (U-14):** Die Spalten richten sich nach der Breite des Widgets statt
  des Fensters; die Vokabularauswahl passt in 320 px.
- **Vorschaubilder ohne Referrer (U-15).**
- **Aufräumen (M-02, M-03, M-06):** Die Gruppenlogik der sieben Layouts liegt in
  einer gemeinsamen Basisklasse. Der `IntegrationModeService` (lief beim Start
  ohne Wirkung, `postMessage` an `'*'` ohne Aufrufer) ist entfernt. Die zehn
  fehlenden `LAYOUT`-Texte sind ergänzt, 108 nirgends verwendete Texte
  entfernt, feste Texte („Felder“, „Core“, JSON-Fehler) übersetzt.
- **Tests und Abhängigkeiten (T-07, DEP-03, DEP-04):** Karma hat eine
  Coverage-Untergrenze, die CI misst Coverage. Ein nicht blockierender
  CI-Job prüft auch die Dev-Abhängigkeiten. `LICENSE` (Apache-2.0) und
  `NOTICE` mit den gebündelten Drittkomponenten; `package-lock.json` trägt
  die Lizenz ebenfalls.

Nachkorrektur aus dem Review vom 18.10.:

- **Ein Layout-Aufruf statt sieben (M-02):** Das Canvas-Template wiederholte
  die rund 40 Bindungen für jedes der sieben Layouts. Der Canvas erzeugt das
  Layout jetzt im Code (`layout-host.ts`) aus einer einzigen Bindungsliste;
  jedes Layout bekommt genau die Ein- und Ausgänge, die es deklariert. Das
  Template schrumpft von 307 auf 9 Zeilen. Verhalten unverändert, festgehalten
  in `canvas-layout-bindings.spec.ts` (vor dem Umbau geschrieben, 29 Fälle).
- **Toter Code:** Die Auswahlliste für Ja/Nein-Felder (`mat-select`,
  `onBooleanChange`) wurde nie gezeigt – Ja/Nein-Felder sind immer
  Optionsfelder – und ist entfernt, samt dem nur dort benutzten Text
  `FIELD.BOOLEAN.EMPTY`.
- **Durchtabben ist keine Eingabe (L-01):** Ein Feld meldet beim Verlassen nur
  noch eine Änderung (auch leere Datums-/Zeitfelder nicht mehr), und der
  Canvas nimmt denselben Wert nicht als Eingabe. Vorher hielt Durchtabben
  während eines Laufs jedes Feld gegen den KI-Wert fest, und bei einer
  Neu-Extraktion wurde ein KI-Wert zum Nutzerwert.
- **Mehrere Elemente einer Instanz (`instance-id`):** Laufnummer und die
  Eingaben während eines Laufs gehören zum gemeinsamen Zustand. Eine Eingabe,
  ein Zurücksetzen oder ein JSON-Import im einen Element gilt auch für einen
  Lauf, den das andere gestartet hat. Laufnummern sind über alle Instanzen
  eindeutig, ein Lauf von vor einem Wechsel der Instanz schreibt nicht in die
  neue.
- **Typwechsel durch die Antwort:** Eingaben während eines Laufs in Felder, die
  der neue Inhaltstyp nicht hat, landen nicht mehr in den Metadaten (sonst
  unter dem neuen Typ exportiert/hochgeladen).
- **Typwahl während einer URL- oder Node-ID-Extraktion** extrahiert dieselbe
  URL bzw. denselben Node für den gewählten Typ neu. Vorher geschah nichts
  oder es lief der Text der vorigen Seite.
- **Start mit `context-name`:** Der Sprach-Stream löst beim Start keine
  Neubeschriftung und keine zweite Kern-Schema-Anfrage mehr aus. Ein
  Kern-Schema, das angefordert wird, während der Kontext gesetzt wird, wartet
  auf diesen, statt auf `default` zurückzufallen und den konfigurierten
  Kontext (z. B. `mds_oeh`) zu überschreiben; gleichzeitige Anfragen gehen
  einmal raus.
- **Aufräumen (M-02):** Text-, URL-, Node-ID-Extraktion und Typwechsel laufen
  über eine gemeinsame `runExtraction` (vorher vier fast gleiche Abläufe).
- 248 Specs.

Korrekturen aus dem Release-Review vom 18.10. (2.1.1 → 3.0.0):

- **Werte je Inhaltsart gehören zur Seite (M4):** Die beim Typwechsel gemerkten
  Werte wurden nie verworfen. Eine Typwahl brachte die Spezialfelder einer
  früheren Seite zurück (exportiert und hochgeladen mit der neuen) und brach
  eine laufende Extraktion ab, ohne sie für den Typ neu zu starten. Jetzt
  verwerfen Zurücksetzen, Laden/Import und jede neue Extraktion diese Werte;
  eine Typwahl während eines Laufs startet ihn immer für den gewählten Typ neu.
- **Getippte Uhrzeit (#22):** Das Zeitfeld nimmt auch `9.30` an; eine ungültige
  Eingabe (`930?`, `abc`) zeigt den Fehler und bleibt stehen, statt durch
  „Invalid DateTime“ ersetzt zu werden. Die Uhr öffnet weiter über den Button
  und gibt den Fokus an das Feld zurück.
- **Instanzwechsel (#23):** Ein Lauf, der beim Wechsel der `instance-id` noch
  unterwegs war, beendet den Spinner der alten Instanz; ein anderes Element
  dort drehte sonst endlos und sendete kein `metadataChange` mehr.
- **Textfeld nach Typwahl (#24):** Ersetzt eine Typwahl die Textextraktion und
  gelingt der neue Lauf, wird das Textfeld geleert wie nach jeder erfolgreichen
  Extraktion; vorher ging der Text beim nächsten Klick als Korrektur raus.
- **Sprachwechsel während eines Laufs (#25):** Neu beschriftete Feldnamen
  fallen nicht mehr auf die alte Sprache zurück, wenn die Antwort einen neuen
  Inhaltstyp mitbringt.
- **Upload-Fehler:** Abgelehnte Anfragen (422) zeigen die Ursache statt
  „[object Object]“, jeder Fehler die Anfrage-ID. Nach einer Zeitüberschreitung
  (`UPLOAD_TIMEOUT`) sagt das Widget, ob der angelegte Node verworfen wurde oder
  noch im Repository liegt. „Schema initialization failed“, „Upload failed“
  und „Unknown error“ sind übersetzt (de/en).
- **Upload-Button behält den Fokus:** Während des Uploads ist er
  `aria-disabled` statt `disabled` (der Klick bleibt wirkungslos), so kann die
  Ergebnismeldung den Fokus zurückgeben (U-05).
- **Import:** Ein Import ohne `metadataset` behält keine Felder und keinen Typ
  der vorigen Seite mehr, einer ohne `_source_text` bzw. Vorschaubild nicht
  deren Text (Upload-`extended_text`, Quelle einer Neu-Extraktion) und Bild.
  Ein zusammen mit `metadata-input` gesetztes `preview-image` bleibt. Fehler
  beim Laden von `metadata-input` erscheinen als Meldung statt als
  unbehandelte Ablehnung.
- **Kontextwechsel:** Gruppen der Inhaltsarten werden mit den Feldern neu
  geladen. **Unterfelder:** Eine Eingabe in ein Unterfeld während eines Laufs
  macht nur dieses zum Nutzerwert, nicht seine Geschwister.
- **Deploy (`scripts/build-elements.js`, #26–#28):** Fehlende Lizenztexte
  stoppen vor dem ersten Schreiben. Die Lizenztexte der Schriften liegen neben
  ihnen (`dist/fonts/OFL.txt` für Roboto, `LICENSE-material-icons.txt`). Das
  Skript nennt das Ziel und lehnt einen Agenten anderer Hauptversion ab (außer
  mit `--force`) – der Standard-Pfad zeigte auf den Agenten 2.1.1.
- **Nachprüfung dieser Korrekturen:**
  - Uhr und Kalender sind in schreibgeschützten Zeit- und Datum-Zeit-Feldern
    und während einer Extraktion gesperrt (sie nahmen dort Werte an; in 2.1.1
    galt das für Zeitfelder schon, für Datum-Zeit-Felder nicht).
  - Zwei schnelle Typwahlen während einer Extraktion starten den Lauf für die
    zweite neu, auch bei leerem Formular; vorher ging er still verloren.
  - Zurück zu einem gemerkten Typ während eines Laufs: dessen gemerkte Werte
    gehen mit ihrer Herkunft (KI/Nutzer) in die Neu-Extraktion (U-06).
  - Das `preview-image` des Hosts bleibt nach jedem Import über
    `metadata-input` ohne eigenes Bild, auch wenn es vorher oder während des
    Ladens gesetzt wurde.
  - Der Upload-Button sieht während des Uploads gesperrt aus (er behielt Farbe
    und Hover).
  - Ist der Agent nicht erreichbar, fehlen die Texte: Schemafehler, unbekannte
    Ursache und Ladefehler von `metadata-input` erscheinen dann englisch mit
    Ursache statt als roher Schlüssel.
  - `uploadResult.error` (Host-Ereignis) ist bei HTTP-Fehlern ein lesbarer Text
    in der Widget-Sprache mit Ursache und Anfrage-ID; vorher `detail`
    unverändert, bei 422 eine Liste. README beschreibt das Feld.
- **Aufräumen und Doku:** Rund 600 Zeilen Canvas-Styles für Elemente, die das
  Canvas-Template nicht hat, sind entfernt; der Fokusring des Vorschaubilds
  nutzt die Widget-Farbe. README: Projektstruktur, Deploy-Schritte und die
  Grenze von `instance-id` (`api-url` und `context-name` gelten seitenweit).
- 322 Specs, Coverage-Untergrenze angehoben.

Korrekturen aus dem Audit (`metadata-agent/docs/audits/2026-10-17-audit-3.0.0.md`):

- **Überholte Läufe schreiben nicht mehr ins Formular (L-01):** Nach einem
  Zurücksetzen, einer Typwahl oder einem JSON-Import während einer Extraktion
  kehrten Werte der vorigen Seite zurück – die Prüfung galt nur der Antwort von
  `/generate`, nicht den Schritten danach. Jetzt wird nach jedem Warten
  geprüft; Laden und Import verwerfen einen laufenden Lauf, eine Typwahl
  ersetzt ihn durch einen Lauf für den gewählten Typ. Ein überholter Lauf
  schickt keine Anfrage mehr ab.
- **Typwechsel behält die Kern-Eingaben (U-06):** Die neu angestoßene
  Generierung bekommt die Kernfelder mit ihrer Herkunft (KI/Nutzer) als
  `existing_metadata`; die Felder des alten Typs nicht. Der Agent überschreibt
  Werte mit Herkunft „Nutzer“ nicht.
- **Tastatur und Screenreader (U-01):** Vokabularfelder öffnen ihre Auswahl mit
  Enter, Leertaste oder Pfeil nach unten (combobox mit Dialog); die Auswahl ist
  ein modaler Dialog mit Fokusfalle, Escape schließt sie und gibt den Fokus an
  das Feld zurück. Aufklappbare Feldgruppen sind Buttons mit
  `aria-expanded`. Icon-Buttons und Fortschrittsbalken haben Namen.
- **Keine Browser-Dialoge mehr (U-05):** Meldungen und Rückfragen (Zurücksetzen,
  Dublette, Upload-Fehler) erscheinen im Widget statt per `alert()`/`confirm()`,
  die die Host-Seite blockierten und in Sandbox-iframes unterdrückt werden.
  Nach dem Schließen kehrt der Fokus zum auslösenden Button zurück; beim
  Zurücksetzen steht er zuerst auf „Abbrechen“; Escape bricht ab und schließt
  keinen Dialog der Host-Seite, in dem das Widget sitzt. Meldungen werden über
  Live-Regionen angesagt, auch wenn dieselbe zweimal kommt.
- **Keine Styles mehr für die Host-Seite (U-05):** Design-Tokens, Scrollbars
  und der Fokusring gelten nur noch im Widget; `html`/`body` und die
  `--mat-app-*`-Tokens der Host-Seite bleiben unberührt.
- **URL-Prüfung:** Eine Eingabe mit Leerzeichen gilt nicht mehr als URL
  („https://kein link“ wurde angenommen).
- **Tests (T-02):** axe-core prüft alle sieben Layouts, Feld, Auswahl und
  Meldungen (keine Verstöße „serious“/„critical“); neue Specs für die
  Validierung, die Meldungen und den Canvas; `npm audit` in der CI. 155 Specs.
- **Gesperrter Speicher (U-03):** Ohne Zugriff auf `localStorage` (Sandbox,
  Drittanbieter-iframe) startet das Widget trotzdem und wechselt die Sprache,
  nur ohne sie sich zu merken.

- `canvas.service.ts` (1.225 → 1.012 Zeilen): reine Hilfen ausgelagert –
  `canvas-fields.ts` (gefüllt, zählbar, Gruppierung), `canvas-feedback.ts`
  (Fehlertext mit Anfrage-ID, Antwortprüfung, Warnung bei Teilergebnis) und
  `canvas-metadata.ts` (Metadaten für Neu-Extraktion und Export). Die
  öffentliche API von `CanvasService` ist unverändert; `loadMetadata` meldet
  zusätzlich (`Promise<boolean>`), ob es von einer anderen Aktion überholt
  wurde, ebenso `selectContentType`.
- Toter Code entfernt: `app.module.ts`, `controls.component.ts`,
  `layouts/index.ts` (waren von der Kompilierung ausgeschlossen).

## 2.1.1 — 2026-10-17 — Versionsstand zum Agenten 2.1.1

Gehört zum Agenten 2.1.1. Am Verhalten ändert sich nichts; das Bundle meldet
2.1.1 und lädt seine Texte als `/widget/i18n/<sprache>.json?v=2.1.1`, damit
Browser keine zwischengespeicherten Texte von 2.1.0 verwenden.

## 2.1.0 — 2026-10-14 — Fehler und Teilergebnisse sichtbar

Gehört zum Agenten 2.1.0. Der meldet Fehlschläge als HTTP-Fehler mit
`error.code` und Teilergebnisse über `processing.status`, statt wie zuvor ein
leeres Ergebnis als Erfolg auszugeben.

- **Fehlschläge mit Ursache:** Statt der festen englischen Meldung
  „Extraction failed …“ steht dort „KI-Erschließung fehlgeschlagen: <Ursache>“
  bzw. „AI metadata generation failed: …“. Die Ursache ist die Meldung des
  Agenten (`error.message`); bei älteren Agenten `detail`, sonst die
  Transportmeldung. Das gilt für Text-, URL-, Node-ID-Extraktion und
  Inhaltsart-Wechsel. Liefert der Agent im Fehler eine Anfrage-ID
  (`error.request_id`), hängt die Meldung „(Anfrage-ID: …)“ an. Unter dieser ID
  steht die technische Ursache im Log des Agenten. Den Header `X-Request-ID`
  zeigt das Widget nicht an, weil es zu Fehlern ohne Fehlercode keine Logzeile
  gibt.
- **Keine 200-Antwort ohne Ergebnis übernehmen:** Eine Antwort ohne
  `processing`, mit `status: "failed"` oder mit `success: false` gilt als
  Fehlschlag. Solche Antworten kommen etwa von einem Proxy dazwischen oder von
  einem älteren Agenten. Sie werden nicht über das Formular gelegt.
  `ApiService.generate()` wirft bei einem leeren 200 nicht mehr selbst einen
  `TypeError`.
- **Übersetzungen passend zur Version:** Die Texte werden als
  `/widget/i18n/<sprache>.json?v=<Widget-Version>` geladen. Der Agent lässt
  Browser die Datei eine Stunde lang zwischenspeichern. Ohne Versionskennung traf
  ein neues Bundle nach einem Deployment auf die alten Texte und zeigte neue
  Schlüssel roh an (im Test: „(EXTRACTION_RESULT.REQUEST_ID)“).
- **Teilergebnisse und geratene Inhaltsart als Warnung:**
  - Bei `processing.status: "partial"` steht dort „Nur X von Y Feldern wurden
    generiert, Z Feldabfragen sind fehlgeschlagen.“ samt Ursache.
  - Bei `content_type_detection.method: "keywords"` steht dort, dass die
    Inhaltsart nur vorläufig eingeordnet ist.

  Die Warnung ist gelb, hat `role="status"` und erscheint in allen fünf
  Layouts; im Default-Layout lässt sie sich schließen. Ein neuer Lauf setzt
  Fehler und Warnung zurück.
- **Inhaltsart-Wechsel leert das Formular nicht mehr, wenn er scheitert:** Die
  Kernfelder werden erst zurückgesetzt, wenn die neue Generierung geantwortet
  hat.
- `GenerateProcessing` beschreibt die neuen Antwortfelder (`status`,
  `fields_failed`, `auth_source`, `content_type_detection`, `error`). Alle sind
  optional, das Widget läuft also auch gegen einen Agenten 2.0.x.
- **Korrekturen aus dem Code-Audit (15.10.2026):**
  - Die Material-Regeln des Widgets gelten nur noch im Widget. Bisher blendeten
    sie auf der ganzen edu-sharing-Seite alle Hinweise und Fehler unter
    Formularfeldern aus und zogen jedes Feld auf volle Breite.
  - Validierungsfehler eines Feldes erscheinen unter dem Feld (`role="alert"`),
    statt in einem `mat-error`, den Material nie anzeigte.
  - Laufen mehrere Generierungen gleichzeitig (Zurücksetzen, neue URL,
    Inhaltsart-Wechsel), gilt nur die neueste. Eine spätere Antwort der alten
    überschreibt das Formular nicht mehr, und der Ladezustand endet erst mit
    der neuesten.
  - Die Layouts „Detail“ und „Prüftisch Org“ zeigen Fehler und Warnungen an;
    Fehlermeldungen tragen in allen Layouts `role="alert"`.
  - Ein nicht ladbares Inhaltsart-Schema wird als Fehler gemeldet und nicht
    zwischengespeichert. Die neue Inhaltsart erscheint dann ohne eigene Felder,
    statt die Felder der vorigen zu behalten (die sonst unter der neuen
    Inhaltsart exportiert würden); die Kernfelder einer Generierung bleiben.
  - Das Attribut `preview-image` wirkt (vorher ohne Effekt).
  - Die Host-Konsole bekommt keine Metadaten-Auszüge mehr.
  - Entfernt: ungenutzte Pakete `ngx-edu-sharing-b-api`,
    `@angular/platform-browser-dynamic`, `@ngx-translate/http-loader`,
    `concurrently`, `dotenv` und die Skripte `proxy`, `start:proxy`, `lint`
    (sie riefen eine fehlende Datei bzw. ein nicht vorhandenes Ziel auf).

## 2.0.2 — 2026-10-07 — gezielte Korrekturen auf dem stabilen Stand

Ersetzt den Stabilisierungsversuch (Widget 2.0.1: Angular-21-Umbau zusammen mit
rund 7.000 weiteren geänderten Zeilen), der beim Einbetten in edu-sharing neue
Fehler erzeugte (in Prod u.a. `Metadata input must be a JSON object`). Er liegt
unverändert im lokalen Branch `backup/fix-attempt-2026-10-07`. Diese Version
setzt auf dem letzten stabilen Stand auf und ändert nur Folgendes:

- **Keine Google Fonts mehr.** Roboto (300/400/500) und Material Icons
  (filled + outlined) werden selbst ausgeliefert (`dist/fonts/`, Pakete
  `@fontsource/roboto` und `material-icons`). `styles.css` enthält die
  `@font-face`-Regeln und die Icon-Klassen; `main.js` lädt kein externes
  Stylesheet mehr. Die Schriften heißen `Metadata Agent Roboto` und
  `Metadata Agent Material Icons (Outlined)`, damit sie gleichnamige Schriften
  der Host-Seite weder ersetzen noch mit ihnen gemischt werden.
- **Theme, Schrift und Icons bleiben beim Widget.** Das Material-Theme stand
  auf `html`. Seit Widget und edu-sharing dieselbe Material-Version nutzen,
  lesen beide dieselben `--mat-*`-Tokens — global gesetzt, hätte das Widget die
  Material-Komponenten des Hosts umgefärbt und umdimensioniert. Theme,
  Textschrift und Icon-Klassen gelten jetzt nur in `<metadata-agent-canvas>`
  (bzw. dem eigenen `<app-root>`) und im eigenen Overlay-Container, den das
  Widget mit der Klasse `metadata-agent-overlays` markiert (Menüs, Datums- und
  Zeitwähler). Die globale `font-family` auf `html, body` entfällt; ebenso das
  `html { --mat-sys-on-surface: initial }` aus `mat.app-background()`, das ein
  M3-Systemtoken des Hosts gelöscht hätte. Im Widget selbst bleiben Farben und
  Maße gleich (im Browser gegen den vorigen Build verglichen).
- **Kein Fehler bei doppelt geladenem Bundle.** Wertet ein Host `main.js`
  zweimal aus, bleibt die erste Registrierung von `<metadata-agent-canvas>`
  bestehen, statt mit `NotSupportedError` abzubrechen; die Konsole warnt mit
  laufender und übersprungener Version (doppelte oder veraltete Script-Tags).
  Ein fremdes `<app-root>` (Angular-Host) schaltet das Widget nicht mehr in den
  Standalone-Modus; nur das eigene `index.html` ist markiert.
- **Richtiges Backend ohne Konfiguration.** Ohne `api-url` und
  `window.__ENV.agentUrl` nutzt das Widget die Adresse, von der `main.js`
  geladen wurde (alles vor `/widget/dist/`, inklusive Proxy-Präfix), statt der
  Herkunft der einbettenden Seite. Gewertet wird nur der Pfad der Script-URL —
  ein `?u=/widget/dist/main.js` in einem fremden Script zählt nicht —, und
  Zugangsdaten in der URL fallen weg. Explizite Angaben haben weiterhin Vorrang.
- **Screenshots lokal.** Standardmethode ist `playwright`; `pageshot` bleibt
  als Legacy-Alias gültig. Die Nachaufnahme fordert 1920 × 1080 an.
- **Build-Wächter.** `scripts/build-elements.js` prüft alles, bevor es etwas
  schreibt: kein Bundle darf Google Fonts, einen Vercel-Host oder die
  PageShot-API referenzieren, und jede Schrift, die `styles.css` lädt, muss
  vorhanden sein — die Liste kommt aus den `url(fonts/…)` des gebauten
  Stylesheets statt aus einer Handliste. Die Schriften werden zuerst und an Ort
  und Stelle überschrieben: Das Löschen des Ordners scheiterte unter Windows mit
  `EBUSY`, wenn ein laufender Server eine Schrift offen hielt — nachdem die
  Bundles schon ersetzt waren. Die CI führt den Wächter nach dem Build aus.
- **Angular 21** (21.2.25, Material/CDK 21.2.14, ngx-mat-timepicker 21.0.2,
  TypeScript 5.9) — dieselbe Hauptversion wie die edu-sharing-Instanz. Angular
  19 erhält keine Sicherheitsupdates mehr; `npm audit --omit=dev` meldete 9
  Schwachstellen (3 hoch), jetzt 0. Als eigener Schritt per `ng update` über 20,
  nur mit den nötigen Migrationen: umbenannte Material-Tokens
  (`--mdc-*` → `--mat-*`), `mat.core()` ersetzt, Typ des `plugin-extract`-Events.
  Die Templates sind unverändert — die angebotene Umstellung auf die neue
  Control-Flow-Syntax (`@if`/`@for`) wurde bewusst nicht übernommen; sie ist vor
  einem späteren Angular 22 fällig.
- **Nur noch ein Material-Theme.** Das zusätzliche M2-Prebuilt-Theme
  `indigo-pink` entfällt. Es setzt Tokens, die nur M2 kennt und das M3-Theme
  nie überschreibt — etwa `--mat-slide-toggle-handle-width: 20px` —; unter
  Angular 21 bemaß das den Knopf des Vorschaubild-Schalters nach M2 innerhalb
  der M3-Spur und schob ihn über seine Beschriftung. `styles.css` schrumpft
  dadurch von rund 143 auf 67 kB. **Sichtbar:** Radiobuttons waren pink (M2-
  Akzent), Checkboxen, Schalter und Datumsauswahl indigo; jetzt tragen alle
  das Blau des M3-Themes.
- **Zeitwähler wieder lesbar.** Zeiger und Mittelpunkt sind Material-Toolbars
  mit `color="primary"`; M3 kennt keine Farbvarianten, ohne das M2-Theme
  nahmen sie die Flächenfarbe an und verschwanden auf dem Zifferblatt. Sie
  tragen jetzt die Primärfarbe des Widgets (`--md-primary`). Die bisherigen
  Timepicker-Overrides zielten auf `ngx-mat-timepicker-container`, das weder
  Timepicker 19 noch 21 rendert — sie haben nie gegriffen und sind entfernt.
- **Beispielseiten:** `'Roboto Mono'` kam von Google Fonts und entfällt; die
  Codeblöcke nutzen die Monospace-Schrift des Systems. Den Rahmen der Seiten
  setzen sie weiter in `Roboto` — ohne Google-Link greift dort die
  Systemschrift, sofern Roboto nicht installiert ist.

---

Stand: 2026-08-18 · gegenüber Commit `c16d872`

Im Arbeitsbaum, noch nicht committet. `ng test` läuft mit **23 Specs** durch
(vorher gab es keinen Testlauf), Type-Check und Produktionsbuild sind sauber.

Hintergrund und die Regeln, an die sich beide Seiten halten müssen, stehen im
Backend-Repository in **`OBJEKTFELDER.md`**. Wer hier an Objektfeldern arbeitet,
sollte das gelesen haben.

---

## Der Anlass

Ein Feld, das das Schema als Objekt deklariert, muss ein Objekt enthalten.
`ccm:oeh_extendedData` wird von Elasticsearch mit dynamischem Mapping indiziert:
der erste Datensatz, der einen Pfad füllt, legt dessen Typ für den ganzen Index
fest. Ein einziger String an dieser Stelle sperrt jeden späteren, korrekt
strukturierten Datensatz aus dem Index aus.

Das Widget war der Weg, über den dieser String hereinkam — zweimal, beide Male
als Handeingabe (`_origins: user`).

---

## 1. Die Maske entscheidet aus dem Schema, nicht aus dem Wert

`canvas.service.ts` · `applyValueToField`

**Vorher:**

```ts
const isComplexObject = (hasShape || hasVariants) &&
  (typeof value === 'object' && !Array.isArray(value) ||
   (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object'));
```

Ob ein Feld als Objekt behandelt wurde, hing am **Wert**. Bei einem String war
die Antwort „nein": es entstanden keine Unterfelder, `isParent` blieb falsch,
und `field.component.html` rendert in dem Fall wegen `*ngIf="!field.isParent"`
ein gewöhnliches Texteingabefeld. Die Redaktion sah nie ein Objektformular,
tippte einen Namen, und `getMetadataForExport` gab den String unverändert weiter.

**Jetzt:** `declaresObjects(schemaFieldDef?.system)` — die Frage beantwortet das
Schema.

## 2. Das Objektformular erscheint auch bei leerem oder skalarem Wert

`shape-expander.service.ts` · `expandFieldWithShape`

**Vorher:** Für alles, was nicht schon ein Objekt war, kam `[]` zurück — siehe
Punkt 1.
**Jetzt:** Ein skalarer Wert wird über `toObjectShape` in die Form gehoben, ein
leeres Feld bekommt das leere Formular. Damit ist die Textzeile, in die man
einen Namen tippen konnte, verschwunden.

Der Expander findet die Varianten jetzt auch in der alten Position
(`system.variants` statt `system.items.variants`), die ältere Schema-Releases
noch ausliefern. Vorher fand er dort nichts, weshalb Personenfelder gar kein
Objektformular hatten.

**Gegenstück beim Export:** `reconstructObjectFromSubFields` verwirft Objekte
ohne jeden Inhalt. Ohne das würde jedes unbefüllte Objektfeld `[{}]` in die
Metadaten schreiben, sobald das Formular immer angeboten wird.

## 3. Objektlisten werden als Objektlisten validiert

`field-validation.service.ts`

Die Array-Weiche steht **vor** der Typweiche, und `validateArray` schickte jedes
Element durch `validateSingleValue` — das ohne Vokabular als **String**
validierte. Der `case 'object'` war für Mehrfachfelder damit unerreichbar. Genau
`schema:contactPoint` ist so ein Feld (`datatype: object`, `multiple: true`), und
`["Virtuelles Haus"]` galt als gültiges String-Array.

Neu in `FieldValidationConfig`: `itemDatatype` und `objectKey`, gefüllt aus
`items.datatype` und den Variantenfeldern des Schemas.

## 4. Kein „accept as-is" mehr

`field-validation.service.ts` · `validateObject`

**Vorher:**

```ts
} catch {
  // Not valid JSON - might be a simple value, accept as-is
  return { valid: true, normalizedValue: value };
}
```

Das war kein vergessener Zweig, sondern eine Entscheidung: ein String in einem
Objektfeld wurde durchgewinkt.

**Jetzt:** Der Wert wird ins deklarierte Unterfeld gehoben und die Maske zeigt
darunter einen Hinweis (`VALIDATION.REPAIRED_TO_OBJECT`, neu in `de.json` und
`en.json`). Werte, aus denen sich kein Objekt bilden lässt — Zahlen, Booleans —
werden abgelehnt.

**Warum hier korrigiert und im Backend abgelehnt wird:** solange das Ergebnis
danach noch auf dem Bildschirm erscheint und verworfen werden kann, ist
Korrektur in Ordnung. Der Schreibpfad im Backend lehnt ab, weil dort schon
gespeichert wird und niemand die Änderung mehr sähe.

## 5. `object-shape.ts` (neu)

Eine Stelle beantwortet „ist das laut Schema ein Objektfeld" und „in welches
Unterfeld gehört ein nackter String". Spiegelt `_is_object_field` und
`_object_key` des Backends.

> **Wichtig:** Die beiden Implementierungen müssen übereinstimmen. Weichen sie
> ab, bekommt derselbe Wert je nach Weg zwei Formen. Am 18.08.2026 stimmen sie
> für alle 2209 Felddeklarationen überein; **abgesichert ist das nicht** — jede
> Seite pinnt nur ihre eigenen zwei Konventionen (`name` für Personenrollen,
> `contactType` für `ContactPoint`).

## 6. Testinfrastruktur (neu)

`package.json` deklarierte `ng test`, aber `angular.json` hatte kein
`test`-Target und weder Karma noch Jasmine waren Abhängigkeiten.

- Karma und Jasmine als Dev-Abhängigkeiten, `tsconfig.spec.json`, `test`-Target
- `karma.conf.js` mit dem Launcher **`ChromeHeadlessCI`** (`--no-sandbox`,
  `--disable-dev-shm-usage`) — ohne die Flags stirbt Chrome im Container beim
  Start, und der Fehler liest sich wie ein kaputter Test
- 23 Specs: `object-shape.spec.ts`, `shape-expander.service.spec.ts`,
  `canvas.service.spec.ts`

## 7. `scripts/build-elements.js` (neu)

`package.json` verweist seit dem ersten Commit darauf, die Datei hat nie
existiert — `npm run build:elements` scheiterte immer auf der zweiten Hälfte.

**Es gibt damit zwei Wege.** Im Backend-Repository liegt bereits
`scripts/deploy-widget.ps1`, das dasselbe tut: bauen, Hash strippen, JS/CSS und
`assets/i18n` kopieren, gzippen. Unterschiede: das PowerShell-Skript läuft nur
unter Windows, erwartet das Widget unter `../metadata-agent-fuerAPI` — ein
Verzeichnisname, den es in dieser Aufteilung nicht mehr gibt — und leert das
Zielverzeichnis vorher, was veraltete Dateien mit entfernt. `build-elements.js`
ist plattformunabhängig und damit auch in der CI verwendbar, überschreibt aber
nur.

Auf Dauer sollte einer der beiden verschwinden; welcher, ist eine Entscheidung
für das Team.

Das Skript reproduziert das ausgelieferte Layout: Hashes strippen, gzippen,
`assets/i18n` mitnehmen. `examples/` wird bewusst **nicht** kopiert — das
Backend pflegt dort 16 Demoseiten gegen 2 in diesem Repository.

Zielverzeichnis über `--target=<pfad>` oder `WIDGET_TARGET`, Vorgabe ist ein
Nachbar-Checkout von `metadata-agent`.

## 8. CI (neu)

Die Pipeline hatte nur SAST und Secret Detection — kein Build, kein Test. Neuer
Job `widget build and tests`: Chromium, `npm ci`, `ng test`, `ng build`, das
`dist/` als Artefakt.

Test und Build stecken bewusst in einem Job: Specs, die in einem nicht
kompilierenden Bundle grün sind, sind wertlos.

## 9. Toter Code entfernt

`local-validation.service.ts` (240 Zeilen) ist gelöscht. Der Service war
vollständig ungenutzt und stand zusätzlich in der `exclude`-Liste von
`tsconfig.json` — vom Compile ausgeschlossen, also bewusst stillgelegt. Alles,
was er konnte, kann `FieldValidationService` auch, dazu Datumszeiten,
Union-Typen, unscharfen Vokabularabgleich und übersetzte Meldungen.

Das Bundle ändert sich dadurch nicht (Hash identisch) — er war nie darin.

> Drei weitere Dateien stehen aus demselben Grund in der `exclude`-Liste und
> haben null Importe: `app.module.ts`, `components/controls/controls.component.ts`,
> `environments/environment.prod.ts`. `layouts/index.ts` steht dort dagegen zu
> Unrecht — es wird sechsmal importiert.
