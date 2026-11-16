# Änderungen

## 4.0.2 — 2026-11-16 — Farbe von Kalender und Uhr, Einbettung in edu-sharing

Gehört zum Agenten 4.0.2. Attribute, Ereignisse und Ansichten wie in 4.0.1.

- **Kalender und Uhr in einer Farbe:** In edu-sharing war das
  Kalender-Symbol eines Datumsfelds grau, das Uhr-Symbol daneben schwarz.
  Material färbt die beiden über verschiedene Tokens (Datepicker-Token bzw.
  Icon-Button-Token), und das Theme von edu-sharing setzt sie verschieden.
  Das Widget setzt beide Tokens an den beiden Symbolen auf die Farbe des
  Dropdown-Pfeils (`#5b667a`), unabhängig vom Theme der Seite. Gesperrt
  (während der Erschließung) und geöffnet behalten sie die Farben von
  Material. Zwei Specs setzen die Tokens wie eine Host-Seite.
- **Doku, Einbettung in edu-sharing:** Die „kleinste Korrektur“ gegen den kurz
  sichtbaren Eingabebereich setzte nur `layout` und `show-floating-controls`.
  Jetzt ein vollständiges Beispiel für beide Templates, passend zur
  Konfiguration von edu-sharing (ohne Eingabebereich, ohne Basisfelder, ohne
  schwebende Leiste; `layout`, `readonly`, `columns` und `language` als
  Attribut-Binding). Im Browser mit einer nachgebauten edu-sharing-Seite
  geprüft (README und README.de).

## 4.0.1 — 2026-11-15 — Datum in der englischen Nur-Lese-Ansicht

Gehört zum Agenten 4.0.1. Attribute, Ereignisse und Ansichten wie in 4.0.0.

- **Datum in einem englischen Widget:** Startete das Widget auf Englisch,
  zeigte die Nur-Lese-Ansicht ein Datum mit deutschen Punkten (`03.05.2026`),
  ein Datum mit Uhrzeit daneben aber englisch (`03/05/2026 14:00`). Der Text
  des Datums entstand, bevor der Datums-Adapter die Sprache kannte
  (`ngOnChanges` läuft vor `ngOnInit`). Der Adapter bekommt die Sprache jetzt
  im Konstruktor von `FieldComponent`. Nach einem Sprachwechsel stimmte es
  schon bisher.
- **Specs unabhängig von der Browser-Sprache:** `layout-readonly-values.spec.ts`
  legte die Sprache nicht fest. Ohne Vorgabe richtet sich das Widget nach dem
  Browser; die sieben Specs „shows every value as text“ liefen deshalb in einem
  deutschen Chrome durch und scheiterten im englischen Chromium des
  CI-Containers – so in der ersten GitLab-Pipeline von 4.0.0. Die Spec setzt
  die Sprache jetzt wie eine Host-Seite, und ein neuer Fall prüft die englische
  Ansicht.
- **Geprüft:** Karma 1282 Specs, mit deutsch und mit englisch eingestelltem
  Browser; die Testschritte der Pipeline im Image `node:22.20.0-bookworm`
  nachgestellt.

## 4.0.0 — 2026-11-15 — Korrekturen aus dem Audit vom 14.11.

Gehört zum Agenten 4.0.0. Die Version springt auf 4.0.0, weil sich Verhalten
für Einbettende ändert (Liste unten); Attribute und Ereignisse heißen wie in
3.0.1. Zum Release gehört auch der Abschnitt „Korrekturen aus dem Audit vom
13.11.“ weiter unten, der nie eine eigene Version hatte.

Befunde aus `metadata-agent-3/docs/audits/2026-11-14-audit-3.0.1.md`
(Abschnitte W und U, dazu K-21 bis K-27). Gebaut am 15.11. und in den Agenten
4.0.0 ausgeliefert (`src/static/widget`). Drei Teile: Kernlogik und
Datenfluss; Oberfläche, Barrierefreiheit, Texte; Build, Tests, Abhängigkeiten,
Dokumentation.

Für Einbettende – Verhalten, das sich ändert (alle drei Teile; die Begründung
steht jeweils weiter unten):

- **Datensatz ohne leere Werte:** Ein Feld ohne Wert steht nicht mehr im
  Datensatz (kein `''`, `[]`, `{}`, keine leeren Vorgaben des Agenten), auch
  keine leeren Container in Objekten (`address: {}`). `null` steht nur noch
  für ein Feld, das die Redaktion geleert hat. Fehlende Schlüssel als „kein
  Wert“ lesen (W-41).
- **Datensatz aus den Feldern:** Nach einem Wechsel des Inhaltstyps enthält er,
  was das Formular zeigt; Werte gemeinsamer Feld-IDs wandern mit, die übrigen
  kommen beim Zurückwechseln wieder (W-31). Bearbeitete Objekte sind `user`;
  `_origins` nennt keine Container mehr (W-32). `schema:provider` hat ein
  Unterfeld `name` (W-30). Objektfelder sind von Anfang an Objektformulare
  (W-42).
- **`metadataChange` sofort nach einer Eingabe** – im selben Task, bevor der
  Blur-Handler zurückkehrt; andere Änderungen weiter nach 50 ms (W-36).
- **`contentType` im Datensatz** nennt den Inhaltstyp, wenn `metadataset`,
  `metadataset_uri` und `schemaFile` fehlen, und ist nie ein Feld (W-39).
  Kopf-Schlüssel eines flachen Datensatzes (`processing`, `preview_image_url`
  …) sind nie Felder; was kein Datensatz ist, wird abgelehnt (W-34). Ein
  Datensatz eines anderen Kontexts oder einer anderen Version bekommt einen
  Hinweis (W-44).
- **`metadataInput`** gilt beim Setzen, in der Reihenfolge mit `contentType`;
  `null` leert nichts; dasselbe Objekt noch einmal importiert nicht – ein neues
  Objekt übergeben (W-48).
- **Aus- und wieder eingehängt:** Das Element kommt mit allem zurück, was die
  Seite gesetzt hat (auch `metadataInput`), nicht mit seither Getipptem;
  `auto-extract` und `force-reset` werden nicht wiederholt (U-08 a, W-38).
- **Entferntes Attribut = Vorgabe des Layouts** (auch `undefined` als
  Property), statt `false` bzw. dem alten Wert; `readonly` ohne Wert heißt
  Nur-Lesen (U-08 d, W-46). Properties sind lesbar (U-08 c). `autoExtract` und
  `forceReset` wirken bei jedem Setzen (U-08 b).
- **Neues Attribut `language`** (`de`/`en`), vor der gemerkten Wahl; ohne es
  zählt nach der gemerkten Wahl das nächste `lang` der Seite. Gemerkt wird nur
  noch die Wahl des Umschalters; `app_language` wird nicht mehr gelesen (U-05).
- **Texte sind im Bundle;** die Datei des Agenten wird darübergelegt und
  gewinnt – `assets/i18n/` des Agenten muss mit dem Bundle ausgeliefert werden
  (`build-elements.js` tut beides zusammen). `./assets/i18n/` der einbettenden
  Seite wird nicht mehr angefragt (U-04).
- **Nur-Lese-Ansichten zeigen Text:** `.readonly-field`, `.readonly-label`,
  `.readonly-value`, `.readonly-list` statt `mat-form-field` mit
  `input:disabled`; URLs sind Links (U-02).
- **Zeitwähler als Liste:** Uhrzeiten in 15-Minuten-Schritten unter dem Feld
  statt des Zifferblatt-Dialogs; gespeicherte Werte unverändert (U-06, U-19).
- **Fortschrittszeile mit „Abbrechen“ in jedem Layout;** Banner überall
  schließbar; Inhaltstyp-Menü und „Zurücksetzen“ während eines Laufs gesperrt
  (U-03, U-12, K-23). Nach „Abbrechen“ bleibt vom abgebrochenen Lauf nichts
  zurück, auch nicht dessen Text als `extended_text` (dritter Teil).
- **Reihenfolge im `plugin`-Layout:** „An Plugin senden“ vor „Ins Repository
  hochladen“ (Speichern, Upload, Zurücksetzen wie überall). Gruppen in
  `plugin` und `prueftisch` lassen sich einklappen; Preset-Schlüssel, die
  niemand las, sind entfernt (U-12).
- **`metadataSubmit`** kommt von dem Element, dessen Button gedrückt wurde
  (W-35).
- **`repository` wird nicht mehr gesendet** (Upload und Erschließung; W-N).
  Kein Upload eines Formulars, dem Felder fehlen (`uploadResult` mit
  `success: false`, W-45). Zeitlimits 30 s / 130 s / 330 s (W-50).
- **Neue Statustexte** statt Angulars Meldung mit der Anfrageadresse: 401/403,
  404, 413, 422, 429, jeder andere Status, Zeitüberschreitung, „200, aber kein
  JSON“ (W-40); dazu `UPLOAD_FORM_INCOMPLETE`, `UPLOAD_NO_ANSWER`,
  `RECORD_OTHER_SCHEMA`.
- **Darstellung:** Feldbeschreibung unter dem Feld statt als Platzhalter
  (U-01); Buttons zum Hinzufügen und Entfernen von Objekteinträgen (W-42);
  Vokabularauswahl in Seiten zu 200 Einträgen (U-15); Fokusrahmen von Buttons
  und Links auch ohne `styles.css` (dritter Teil, U-16).
- **Keine Zone-Flags mehr auf der einbettenden Seite** (K-25).
- **Auslieferung:** neben den Bundles liegt `dist/build.json` (Version,
  Build-Zeit, Hashes). `main.js` ist 20 % kleiner (1,16 MB statt 1,45 MB).
  Eigenständige Seite: `?viewerMode=true` wirkt wieder (dritter Teil).

### Kernlogik und Datenfluss (Abschnitt W, dazu U-08 und K-25)

Im Einzelnen:

- **Der Datensatz ist, was das Formular zeigt (W-31):** Ereignisse,
  JSON-Download und Upload lasen eine Wertekarte, die dem Formular nur lose
  folgte. Nach einem Wechsel der Inhaltsart ohne neuen Lauf standen dort Werte,
  die das Formular leer zeigte (44 Feld-IDs kommen in mehreren Inhaltsarten
  vor, darunter Lizenzschlüssel); nach einer Korrekturrunde fehlten Werte, die
  das Formular noch zeigte. Jetzt wird der Datensatz aus den Feldern gebaut.
  Beim Wechsel der Inhaltsart wandern die Werte der Feld-IDs, die beide Arten
  haben, mit ihrer Herkunft in die neuen Felder; Werte von Feldern, die die
  neue Art nicht hat, verlassen den Datensatz und kommen zurück, wenn man zur
  alten Art zurückwechselt. Schlüssel eines Imports, für die es kein Feld
  gibt, bleiben wie bisher im Ereignis und im JSON, nicht im Upload.
- **Eine Regel für leere Werte (W-41):** Ein Feld ohne Wert steht nicht im
  Datensatz – weder als `''`, `[]` oder `{}` noch als leere Vorgabe des
  Agenten (bisher 48 Schlüssel für ein Formular mit einem Wert). Als leer
  gilt auch, was nur Leeres enthält: `[{}]`, `{ "address": {} }`,
  `[{ "@type": "Place" }]`; solche Felder zählen nicht mehr als gefüllt.
  Unverändert: ein von der Redaktion geleertes Feld steht als `null` im
  Datensatz (W-LOG-02), jetzt auch ein vollständig geleertes Objektfeld.
  Dieselbe Regel gilt für `existing_metadata` des nächsten Laufs. Wer
  Ereignisse in ein eigenes Formular übernimmt, sollte fehlende Schlüssel als
  „kein Wert“ lesen und nicht als „unverändert“.
- **Keine leeren Container in Objekten (W-41):** Jeder Eintrag kam mit
  `address: {}` und `geo: {}` zurück, auch wenn der Datensatz keines von
  beiden hatte. Container, die das Formular zeigt, stehen nur noch im Objekt,
  wenn etwas in ihnen steht; ein importiertes `address: {}` entfällt beim
  Export. `@type` und Schlüssel ohne Unterfeld bleiben wie hereingekommen
  (W-LOG-03).
- **Objektfelder ohne Varianten (W-30):** `schema:provider` in `course.json`
  und `education_program.json` (ein Objekt ohne beschriebene Unterfelder)
  wurde in die Schlüssel der eigenen Schema-Definition aufgefächert: 18
  Eingabefelder „Anbieter (Label.de)“ …, und `label`, `description`, `prompt`,
  `system` im Datensatz. Jetzt ein Eingabefeld „Anbieter (Name)“; alle anderen
  Schlüssel des Objekts bleiben erhalten. Export gleich Import.
- **Objektfelder sind von Anfang an Objektformulare (W-42):** Ein Objektfeld,
  das im Datensatz fehlt, war ein einfaches Textfeld. Es zeigt jetzt die
  Unterfelder seiner ersten Variante; ein unberührtes Formular wird weiterhin
  nicht exportiert. Neu im Dienst: `addObjectEntry(fieldId)` und
  `removeObjectEntry(fieldId, index)` für Einträge von Objektlisten (die
  Buttons dazu folgen mit der Oberfläche).
- **Bearbeitete Objekte gehören der Redaktion (W-32):** Das Ändern eines
  Unterfelds ließ Status und Herkunft des Objektfelds stehen. Der nächste
  KI-Lauf bekam `_origins: { "schema:location": "ai" }` und ersetzte das
  Objekt; ein in ein leeres Feld getipptes Objekt ließ das Feld „leer“. Jetzt
  ist das Objektfeld danach gefüllt und `user`. `_origins` nennt für
  Unterfelder nur noch Eingabefelder (nicht mehr Container wie
  `schema:location.address`), und ein Import stellt die Herkunft je Unterfeld
  wieder her.
- **Kein Datensatz, kein Import (W-34):** Eine Liste, ein Text, eine Zahl oder
  ein `metadata`, das kein Objekt ist, wurden Schlüssel für Schlüssel über das
  Formular importiert (`["a","b"]` → `{"0":"a","1":"b"}`). Jetzt abgelehnt mit
  der vorhandenen Meldung (`metadata-input`: „kein gültiges JSON-Objekt“,
  JSON-Datei: „Fehler beim Laden“); das Formular bleibt, wie es war. In einem
  flachen Datensatz sind `contextName`, `schemaVersion`, `metadataset`,
  `metadataset_uri`, `language`, `exportedAt`, `processing`,
  `preview_image_url`, `_origins` und `_source_text` der Kopf und nie Felder
  (bisher kamen `processing` und der Screenshot als Felder zurück).
- **`contentType` im Datensatz (W-39):** Die README-Einbindung legt
  `contentType` in `metadataInput`. Das Widget las den Schlüssel dort nicht:
  keine Inhaltsart, keine typspezifischen Felder, `contentType` als Feld im
  Datensatz. Jetzt nennt er die Inhaltsart (Schemadatei oder URI), wenn
  `metadataset`, `metadataset_uri` und `schemaFile` fehlen – wie diese vor dem
  `content-type` des Elements –, und ist nie ein Feld. `schemaFile` ist
  ebenfalls kein Feld mehr.
- **Hinweis bei anderem Schema (W-44):** `contextName` und `schemaVersion`
  eines importierten Datensatzes wurden stillschweigend durch die des Widgets
  ersetzt. Das Ersetzen bleibt (auch `language` wird die Sprache des Widgets);
  weichen Kontext oder Version ab, sagt es jetzt das Hinweisbanner
  (`ALERTS.RECORD_OTHER_SCHEMA`). `latest`/`vlatest` gilt nicht als
  Abweichung. Ein Import nimmt Fehler- und Hinweisbanner des vorherigen
  Formulars weg.
- **`metadataChange` sofort nach einer Eingabe (W-36):** Der Wert wurde beim
  Verlassen des Feldes übernommen, das Ereignis kam 50 ms später. Für
  Eingaben der Redaktion (auch Hinzufügen/Entfernen von Objekteinträgen)
  kommt es jetzt im selben Task, also bevor der Blur-Handler zurückkehrt.
  Andere Zustandsänderungen werden weiter 50 ms gesammelt. Ein noch wartendes
  Ereignis wird vor einem Import gesendet statt verworfen (bisher ging so das
  Ergebnis einer eben beendeten Erschließung verloren).
- **Mehrere Elemente auf einer Instanz (W-35, W-48):** `metadataSubmit` kommt
  von dem Element, dessen Button gedrückt wurde (bisher nur vom primären; in
  jedem anderen tat „Speichern“ nichts). `metadataChange` kommt weiter nur vom
  primären Element; es meldet einen Import eines anderen Elements einmal und
  erst, wenn er fertig ist (bisher Zwischenstände), und ein nachgerücktes
  Element weiß, was zuletzt gemeldet wurde (das Leeren des letzten Werts
  wurde nicht gemeldet).
- **`metadataInput` gilt beim Setzen (W-48):** Der Datensatz wurde erst mit
  der nächsten Änderungserkennung importiert, `contentType` sofort. Im selben
  Task gesetzt, kam deshalb immer zuerst die Inhaltsart, egal in welcher
  Reihenfolge. Jetzt entscheidet die Reihenfolge des Setzens, im selben Task
  wie einen Tick auseinander: zuerst Datensatz, dann `contentType` → die
  Inhaltsart der Seite; umgekehrt → die des Datensatzes. Folge für
  `el.metadataInput = {…}; el.contentType = '…'` nach dem Einhängen: zwei
  Schritte (Import, dann Inhaltsart) statt eines; lädt das Schema der
  Inhaltsart länger als 50 ms, sind es auch zwei Ereignisse. Nur der
  Datensatz der ersten Eingänge wartet auf alle anderen (`api-url`,
  `instance-id`). `metadataInput = null` (auch ein entferntes Attribut)
  leert nichts; dasselbe Objekt noch einmal zuzuweisen importiert nicht
  erneut – für einen geänderten Datensatz ein neues Objekt übergeben.
- **Aus- und wieder eingehängt (U-08 a, W-38):** Angular zerstört die
  Komponente 10 ms nach dem Aushängen. Gemessen mit Angular 21.2: Beim ersten
  Wiedereinhängen danach wurde gar keine neue gebaut – das Element zeigte das
  letzte DOM der zerstörten Komponente und reagierte auf nichts mehr. Jetzt
  entsteht eine neue Komponente mit allem, was die Seite zuletzt gesetzt hat
  (Properties und Attribute, auch `metadataInput`). Grenzen: Was die
  Redaktion seit dem letzten `metadataInput` getippt hat, und das Ergebnis
  einer Erschließung, sind danach weg (sie wurden per `metadataChange`
  gemeldet); der Import löst ein `metadataChange` aus. `auto-extract` und
  `force-reset` werden nicht wiederholt.
- **Gleicher Wert noch einmal (U-08 b):** `autoExtract = true` und
  `forceReset = true` wirken bei jedem Setzen, auch mit demselben Wert
  (Angular verwirft unveränderte Werte). Für alle anderen Eingänge bleibt es
  dabei; `text` mit demselben Text wie zuvor füllt das nach einer Erschließung
  geleerte Eingabefeld also nicht erneut – dafür `plugin-extract` nutzen.
- **Properties lesbar (U-08 c):** `el.layout`, `el.readonly` … liefern, was
  die Seite zuletzt gesetzt hat (als Property den Wert, als Attribut dessen
  Text), `undefined`, wenn nichts gesetzt wurde. Bisher fast immer
  `undefined`.
- **Entfernte und wertlose Attribute (U-08 d, W-46):** Ein entferntes Attribut
  heißt „nicht gesetzt“: es gilt die Vorgabe des Layouts bzw. der
  Standardwert. Bisher zählte es bei den `show-*`-Schaltern und `readonly` als
  `false` (`removeAttribute('readonly')` entsperrte ein Nur-Lese-Layout), bei
  `borderless`, `columns`, `flat-groups`, `show-preview`, `highlight-ai` blieb
  der alte Wert stehen. Gleiches gilt für `undefined` als Property-Wert.
  `<metadata-agent-canvas readonly>` ohne Wert heißt Nur-Lesen (bisher
  ausgeschaltet).
- **Kein Upload eines unvollständigen Formulars (W-45):** Konnte das Schema
  der Inhaltsart oder das Basisschema nicht geladen werden, sendete „Upload“
  nur die übrigen Felder. Jetzt erscheint stattdessen eine Meldung
  (`ALERTS.UPLOAD_FORM_INCOMPLETE`), und `uploadResult` meldet
  `success: false`. Ein beim Import gescheitertes Basisschema wird im
  Fehlerbanner gezeigt statt nur protokolliert; die Basisfelder des vorherigen
  Formulars bleiben dann nicht mit ihren Werten stehen.
- **Zeitlimits (W-50):** Schema 30 s, Upload 130 s, Erschließung 330 s (über
  den Limits des Agenten von 100 s und 300 s). Danach eine lesbare Meldung
  statt endlosem Warten; beim Upload mit dem Hinweis, dass offen ist, ob der
  Node angelegt wurde. Ein Zurücksetzen gibt den Upload-Button eines
  hängenden Uploads frei.
- **Upload und Erschließung ohne `repository` (W-N):** Das Widget sendete
  immer `repository: "staging"`; der Agent ignoriert das Feld und schreibt in
  das Repository, für das er eingerichtet ist. Das Feld wird nicht mehr
  gesendet.
- **Werte, die nicht zum Feld passen (W-43):** Eine Liste in einem Feld für
  einen Wert, ein Datum, das nicht `JJJJ-MM-TT` ist (`03.05.2026`), oder ein
  Text in einem Zahlfeld ließen das Eingabefeld leer, während der Wert im
  Datensatz blieb und das Feld als gefüllt zählte. Jetzt nennt eine
  Fehlermeldung am Feld den Wert; umgewandelt wird nichts. Ein einzelner Wert
  in einem Listenfeld erscheint als ein Chip und bleibt beim Hinzufügen
  erhalten (bisher brach die Anzeige der Chips ab).
- **Datum-Zeit behält Sekunden und Zeitzone (W-47):** Aus
  `2026-05-03T10:00:00+02:00` wurde nach dem Ändern der Stunde
  `2026-05-03T11:00`. Sekunden und Offset des bisherigen Werts bleiben jetzt
  erhalten – beim Tippen, im Kalender und auf der Uhr.
- **Keine Zone-Flags auf der einbettenden Seite (K-25):** `polyfills.js`
  setzte `__zone_symbol__PASSIVE_EVENTS` und `__zone_symbol__UNPATCHED_EVENTS`
  auf jeder Seite. Lud die Seite ihr zone.js zuerst (edu-sharing), änderte das
  nur zwei Globale; lud das Widget zuerst, wurden die Wheel- und
  Touch-Listener der ganzen Seite passiv. Die Flags stehen jetzt nur noch in
  der eigenen Seite des Widgets (`src/index.html`); `src/zone-flags.ts`
  entfällt. In Seiten ohne eigenes zone.js patcht das zone.js des Widgets
  damit auch Scroll- und Mausbewegungs-Ereignisse.
- **Neue Texte:** `ALERTS.ANSWER_UNREADABLE`, `ACCESS_DENIED`,
  `AGENT_NOT_FOUND`, `REQUEST_TOO_LARGE`, `REQUEST_INVALID`,
  `TOO_MANY_REQUESTS`, `REQUEST_FAILED`, `REQUEST_TIMEOUT`, `UPLOAD_NO_ANSWER`,
  `UPLOAD_FORM_INCOMPLETE`, `RECORD_OTHER_SCHEMA`;
  `VALIDATION.STORED_LIST_ON_SINGLE`, `STORED_VALUE_UNREADABLE`. Bis das
  `assets/i18n/` des Agenten aktualisiert ist, zeigt das Widget dafür seinen
  englischen Ersatztext.

Weitere Korrekturen:

- **Keine Anfrageadresse in Fehlertexten (W-40, K-24):** Für 401/403, 404,
  413, 429, ein 422 ohne lesbare Meldung, jeden anderen Status ohne Text des
  Agenten und für „Status 200, aber kein JSON“ stand im Banner Angulars
  Meldung mit der vollen Adresse (über edu-sharing der interne Proxy-Pfad).
  Jetzt eigene Texte je Fall, auch in der Upload-Meldung. Was der Agent selbst
  sagt, hat weiter Vorrang.
- **Zweiter Versuch nach gescheiterter Erschließung (W-33):** Der Text des
  gescheiterten Laufs blieb als „Quelle“ zurück; der nächste Versuch lief als
  Korrekturrunde und konnte ohne Basisfelder enden (kein Titel in Formular,
  Export und Upload). Ein gescheiterter Lauf hinterlässt nichts mehr, und
  fehlende Basisfelder werden vor jedem Lauf gebaut.
- **Gescheitertes erstes Laden ist nicht endgültig (W-37, K-22):** Typ-Menü
  und `content-type` blieben bis zum Neuladen der Seite ohne Wirkung. Ein
  späteres `api-url`, ein Import oder eine Erschließung laden erneut; das
  Fehlerbanner des ersten Versuchs verschwindet, sobald es geklappt hat.
- **Vergleich ohne Screenshot (W-49):** Für die Frage „hat sich der Datensatz
  geändert?“ wurde bei jeder Zustandsänderung der ganze Datensatz samt
  Screenshot (base64) serialisiert. Vom Bild zählen jetzt Länge, Anfang und
  Ende.
- **Kleinigkeiten (W-N):** Eine Schema-Antwort ohne `fields` (200 von etwas
  anderem als dem Agenten) endet in einer lesbaren Meldung statt in „Cannot
  read properties of undefined“. Die Gruppen einer Inhaltsart werden nur für
  den Kontext gemerkt, in dem sie erfragt wurden. Eine von der Seite eben
  angeforderte Erschließung (`auto-extract`, `plugin-extract`) startet nicht
  mehr, wenn das Element inzwischen zerstört wurde. Die Texte der Chips werden
  einmal je Wertänderung berechnet statt zweimal je Änderungserkennung.
  Entfernt: tote Mitglieder von `SchemaService` (`http`, `ready$`,
  `ensureReady`), der nie gelesene `_chipDisplayCache`, ungenutzte Typen;
  `FieldDataType` kennt `object`, `integer`, `time`, `duration`, `json`,
  `VocabularyInfo.type` kennt `skos`.

### Oberfläche, Barrierefreiheit, Texte (Abschnitt U, dazu W-42 und W-51)

Im Einzelnen:

- **Neues Attribut `language` (U-05):** `language="de"` oder `"en"` (Property
  `language`; ein Regionalkürzel wie `en-GB` zählt als `en`) legt die Sprache
  des Widgets fest und gewinnt über die gemerkte Wahl des Sprachumschalters.
  Bisher konnte die Seite die Sprache nicht setzen, und die für edu-sharing
  empfohlene Einbindung blendet den einzigen Umschalter aus. Reihenfolge:
  `language` der Seite → gemerkte Wahl → das nächste `lang` oberhalb des
  Elements → Sprache des Browsers → Deutsch. Ein entferntes Attribut oder eine
  Sprache, die das Widget nicht spricht, heißt „nicht gesetzt“. Die Sprache
  gilt für alle Widgets einer Seite. Betätigt die Redaktion den Umschalter,
  gilt ihre Wahl, bis die Seite `language` erneut (mit anderem Wert oder nach
  Wiedereinhängen) setzt.
- **Gemerkt wird nur noch eine Wahl (U-05):** Das Widget speicherte beim
  ersten Start die Browsersprache unter `metadata-agent-canvas.language`;
  danach galt sie als „gewählt“. Jetzt schreibt nur der Sprachumschalter.
  Der alte Schlüssel `app_language` wird nicht mehr gelesen (ein Name, den
  jede Seite für eigene Zwecke nutzen kann).
- **Texte sind im Bundle (U-04):** `de.json` und `en.json` sind eingebaut; die
  Datei des Agenten (`/widget/i18n/<sprache>.json`) wird darübergelegt, sobald
  sie da ist. Ließ sie sich nicht laden, zeigte die ganze Oberfläche rohe
  Schlüssel (`INPUT.START_EXTRACTION`) bis zum Neuladen der Seite. Jetzt
  stehen die Texte sofort, auch während die Anfrage läuft; ein gescheitertes
  Laden wird bei der nächsten Sprachverwendung (Sprachwechsel, `api-url`,
  `language`) wiederholt. Das Widget fragt nicht mehr `./assets/i18n/` der
  einbettenden Seite an. Ein neues `api-url` leert die Texte nicht mehr,
  bevor die neuen da sind.
- **Laufende Erschließung in jedem Layout sichtbar und abbrechbar (U-03,
  K-23):** `clean`, `detail`, `dialog`, `prueftisch` und `prueftisch-org`
  zeigten während eines Laufs nichts; es wurde erneut geklickt. Über den
  Feldern steht jetzt in allen sieben Layouts eine Fortschrittszeile
  (`role="progressbar"`, „Extraktion läuft …“) mit „Abbrechen“; die
  Feldgruppen tragen `aria-busy`. „Abbrechen“ bricht die Anfrage ab, zeigt
  keinen Fehler und lässt das Formular, wie es ist (neu im Dienst:
  `cancelExtraction()`). Fehler- und Hinweisbanner lassen sich in jedem Layout
  schließen (bisher nur im Standard-Layout); das Hinweisbanner hat
  `role="status"`. In `default` und `clean` stehen die Banner jetzt unter der
  Statusleiste, wie in den anderen Layouts.
- **Sieben Layouts, ein Verhalten (U-12):** Banner, schwebende Leiste,
  Inhaltstyp-Menü und Gruppenkopf sind je eine gemeinsame Komponente statt
  sieben Kopien. Dadurch:
  - Das Inhaltstyp-Menü ist während eines Laufs in jedem Layout gesperrt
    (bisher nur im Standard-Layout; ein zweiter Klick startete einen zweiten
    Lauf). Der Button bleibt fokussierbar (`aria-disabled`).
  - Der Inhaltstyp-Button der schwebenden Leiste erscheint, wenn
    `show-content-type` gilt – in `default` und `plugin` jetzt auch, bevor das
    Formular Felder hat (bisher erst danach).
  - Ohne Inhaltstyp steht überall „Bitte wählen“ (`detail`, `dialog`,
    `prueftisch-org` zeigten „Inhaltsart wählen“).
  - Der gewählte Typ ist in jedem Menü mit einem Haken markiert und als
    `menuitemradio` mit `aria-checked` ausgezeichnet. Das Menü der schwebenden
    Leiste im Standard-Layout zeigt dafür keine Typ-Icons mehr.
  - „Zurücksetzen“ in der schwebenden Leiste ist während eines Laufs gesperrt
    (wie im Eingabebereich); den Lauf beendet „Abbrechen“.
  - Im `plugin`-Layout steht „An Plugin senden“ jetzt vor „Ins Repository
    hochladen“ (Reihenfolge wie im Standard-Layout: Speichern, Upload,
    Zurücksetzen).
  - Gruppen lassen sich jetzt auch in `plugin` und `prueftisch` einklappen;
    ihre Presets versprachen es, die Vorlagen hatten keinen Schalter. Für
    `dialog` ist `groupCollapse` jetzt `false` (die Vorlage sah keinen vor).
  - Presets versprechen nur, was ein Layout zeichnet: `floatingResetButton`
    ist `false` in `detail`, `clean`, `prueftisch`, `prueftisch-org`,
    `fieldActions` `false` außer in `default`. Die Schlüssel, die niemand las
    (`header`, `closeButton`, `extractButton`, `resetButton`, `progressBar`,
    `footer`, `compact`, `cssClass`, `emitChanges`, `autoExtract`,
    `contentTypeOnly`, `i18nKey`, `i18nDescription`), sind entfernt.
    `show-footer` bleibt als Eingang ohne Wirkung.
- **Nur-Lese-Ansichten zeigen Text (U-02):** Ein Wert stand in einem
  gesperrten Eingabefeld: eine lange URL wurde abgeschnitten, der Rest war
  weder zu sehen noch per Tastatur erreichbar, ein Screenreader sagte
  „nicht verfügbar“. Jetzt ist jeder Wert Text, der vollständig umbricht;
  Adressen in URL-Feldern sind Links (`target="_blank"`,
  `rel="noopener noreferrer"`, nur `http`/`https`), Listen sind Listen. Das
  DOM eines Feldes im Nur-Lese-Modus ist damit ein anderes:
  `.readonly-field`, `.readonly-label`, `.readonly-value`, `.readonly-list`
  statt `mat-form-field` mit `input:disabled`. Eigenes CSS einer Seite, das
  auf die gesperrten Felder zielte, greift dort nicht mehr. `clean`, `detail`
  und `plugin` ragen in Seiten ohne `box-sizing: border-box` nicht mehr 8 bis
  30 px über das Widget hinaus.
- **Beschreibung unter dem Feld (U-01):** Die Feldbeschreibung war der
  Platzhalter (hellgrau, 2,0:1) und verschwand mit dem ersten Zeichen. Sie
  steht jetzt als Hinweis unter dem Feld und gehört zu dessen
  `aria-describedby`; Formulare mit Beschreibungen werden dadurch höher
  (`detail`, `prueftisch` und `prueftisch-org` blenden Hinweise wie bisher
  aus). Der Platzhalter nennt nur noch das Format (`TT.MM.JJJJ`,
  `https://...`) in `#6b7280` (4,8:1).
- **Kalender und Uhr sprechen die Sprache des Widgets (U-06, U-19):** Die
  Buttons des Kalenders hießen „Open calendar“, „Previous month“ …; sie
  kommen jetzt aus den Texten des Widgets (`DATEPICKER.*`). Die Uhr war ein
  Zifferblatt-Dialog einer eigenen Bibliothek mit „CANCEL“/„OK“. Sie ist jetzt
  der Zeitwähler von Angular Material: eine Liste von Uhrzeiten in
  15-Minuten-Schritten, die sich unter dem Feld öffnet; jede andere Minute
  lässt sich wie bisher tippen. Gespeichert wird unverändert `HH:MM` bzw. der
  ISO-Zeitstempel samt Sekunden und Zeitzone (W-47). `ngx-mat-timepicker` und
  `@angular/animations` werden nicht mehr gebraucht (`provideAnimations()`
  entfällt).
- **Einträge von Objektlisten hinzufügen und entfernen (W-42):** Am Ende
  jedes Eintrags (ein Veranstaltungsort, eine Zugehörigkeit) steht „Eintrag
  entfernen“, nach dem letzten „Eintrag hinzufügen“ – mit dem Feldnamen im
  zugänglichen Namen, nicht im Nur-Lese-Modus, nicht für den einzigen leeren
  Eintrag. Ein neuer Eintrag ändert den Datensatz erst, wenn er gefüllt wird;
  das Entfernen eines gefüllten Eintrags ist eine Eingabe (`metadataChange`
  im selben Task).
- **Vokabularauswahl (U-15):** Lange Bezeichnungen brechen um (sie endeten
  mit „…“). Unterbegriffe nennen ihre Ebene im Namen („Algebra, Ebene 2“).
  Felder mit einem Wert bieten Buttons mit `aria-pressed` statt Checkboxen
  (ein zweiter Druck nimmt die Wahl zurück, wie bisher). Lange Vokabulare
  werden zu je 200 Einträgen gezeichnet; „Weitere Einträge anzeigen (noch
  n)“ holt die nächsten, der Filter durchsucht immer alle.
- **Fokus, Ansagen, Sprache der Overlays (U-14, U-22, U-23, U-21, U-09):**
  Startet Strg+Enter die Erschließung, bleibt der Fokus im Textfeld – es ist
  während des Laufs schreibgeschützt statt gesperrt; „Zurücksetzen“ und
  „Webseite laden“ sind `aria-disabled`. Feldfehler werden höflich angesagt
  (`aria-live="polite"` statt `role="alert"` je Feld). Der Overlay-Container
  des Widgets (Menüs, Kalender) trägt dessen `lang`; setzt ein Dialog der
  Seite `aria-hidden` auf ihn, nimmt das Widget das Attribut weg, solange es
  ein Overlay offen hat (zurückgesetzt wird nichts). „Ja“/„Nein“ folgen einem
  Sprachwechsel.
- **Neue Texte:** `PROGRESS.EXTRACTION_RUNNING`, `PROGRESS.CANCEL_EXTRACTION`,
  `INPUT.MODE_LABEL`, `FIELD.CHOOSE_TIME`, `FIELD.ADD_ENTRY`,
  `FIELD.ADD_ENTRY_FOR`, `FIELD.REMOVE_ENTRY`, `FIELD.REMOVE_ENTRY_FOR`,
  `FIELD.VOCAB_LEVEL`, `FIELD.VOCAB_SHOW_MORE` und elf `DATEPICKER.*`.
  Entfernt: die 14 Schlüssel `LAYOUT.<LAYOUT>.NAME`/`.DESCRIPTION`, die
  nichts anzeigte. Geändert (deutsch): durchgehend „Sie“
  (`FIELD.VOCABULARY_CONTROLLED`) und „Inhaltstyp“ statt „Inhaltsart“
  (`CONTENT_TYPE.SELECT`, `ALERTS.UPLOAD_FORM_INCOMPLETE`,
  `EXTRACTION_RESULT.CONTENT_TYPE_UNCERTAIN`, `…SCHEMA_UNAVAILABLE`). Da die
  Texte eingebaut sind, erscheinen die neuen auch, solange das
  `assets/i18n/` des Agenten sie noch nicht hat.

Weitere Korrekturen:

- **Icons (U-07):** `captive_portal` („Webseite laden“) gibt es in der
  ausgelieferten Schrift nicht – der Name stand als Text auf dem Button;
  jetzt `web`. `error_outline` und `help_outline` werden wie `info_outline`
  als SVG gezeichnet (die Schrift von edu-sharing kennt die Outline-Namen
  nicht sicher). Ein Spec prüft jeden Icon-Namen der Vorlagen gegen die
  Codepoint-Liste der Schrift.
- **Farben (U-13):** Warntext `#b34700` (war `#e65100`, 3,8:1), auch im
  Pflichtfeld-Badge der Statusleiste; Gruppenzähler und Einklapp-Icon in
  `$text-secondary` (war `#8b95a5`, 3,0:1); der graue Rand der Radiobuttons
  (2,7:1) entfällt zugunsten der Farbe von Material; KI-Violett auf Chips
  `#6d28d9` (war 4,2:1 beim Überfahren); Gruppen-Icon in `prueftisch-org`
  `#666666` (war 4,4:1); die eingeschaltete Spur des Screenshot-Schalters
  `#5b667a` (war 1,2:1). Die axe-Prüfung läuft für die Layouts jetzt mit
  `color-contrast` unter dem eigenen Theme.
- **Schwebende Leiste (U-25):** Ihre Einblendung bewegte sie 0,3 s lang um
  die halbe Breite nach links (ein `translateX(-50%)` aus einer früheren
  Zentrierung) und ließ sie dann springen; jetzt nur noch von unten. In einem
  320 px breiten Widget umbricht sie, statt hinauszuragen.
- **Kalender, Uhr und Vorschlagsliste nur, wo ein Feld sie hat (U-18):**
  Jedes Feld erzeugte zwei Kalender, zwei Uhren und eine Vorschlagsliste.
  Ungenutzte Material-Importe sind entfernt.
- **Kleinigkeiten (U-N):** Gruppen heißen in jedem Layout `<h3>` (`detail`
  hatte `<h2>`); Großschreibung per CSS statt als Text (`plugin`,
  `prueftisch`, `prueftisch-org`); die Gruppe der Eingabearten hat einen
  Namen; ein Icon für „noch offen“ in beiden Statusleisten
  (`hourglass_empty`); eine CSS-Regel, die nichts traf, ist entfernt;
  `ng serve` antwortet nur noch auf `localhost`.
- **Aufgeräumt (U-24, W-51, K-21):** Entfernt sind die veralteten Demo-Kopien
  `src/examples/` und die Asset-Einträge `src/schemata` (gab es nicht) und
  `src/examples` in `angular.json`; `src/app/shared/layouts/styles/*.scss`
  und `src/app/shared/layouts/README.md`; von `LayoutService` alles außer
  `getLayout()`; `CANVAS_INPUT_PARAMETERS`; `FieldComponent.showActions` und
  seine Bindungen; fünf Kopien von `getGroupIcon` (keine Gruppen-ID traf je
  einen Eintrag ihrer Tabelle). Specs schalten Materials Animationen über
  `src/app/testing/no-animations.ts` ab statt über `NoopAnimationsModule`.

### Build, Tests, Abhängigkeiten, Dokumentation (U-10, U-11, U-16 bis U-20)

Für Einbettende – Verhalten, das sich ändert:

- **„Abbrechen“ hinterlässt nichts (Nachtrag zu K-23, W-33):** Nach dem
  Abbrechen einer Erschließung blieb deren Text als „Quelle“ des Formulars
  stehen: Ein Upload sendete ihn als `extended_text`
  (`ccm:oeh_extendedText`), und eine spätere Typ-Wahl ließ den abgebrochenen
  Lauf – auch eine abgebrochene URL – noch einmal laufen. Quelltext und
  gemerkte Eingabe sind jetzt sofort wieder die von vor dem Lauf, wie nach
  einem gescheiterten.
- **Fokusrahmen ohne `styles.css` (U-16):** Den Fokusrahmen zeichnete nur
  `styles.css`, das edu-sharing nicht lädt. Material markiert einen
  fokussierten Button mit einer Fläche in einer Farbe des Themes; ohne das
  Theme des Widgets ist sie durchsichtig – ohne Material-Theme der Seite war
  der Fokus auf keinem Button zu sehen (auf Eingabefeldern schon, über den
  Rahmen). Buttons, Links und `[tabindex]` bekommen den Rahmen (2 px,
  `--md-primary`, sonst `#0062ac`) jetzt aus `main.js`. Mit `styles.css`
  ändert sich nichts; in edu-sharing erscheint er zusätzlich zu dem, was
  dessen Theme zeigt. Die Overlays (Menüs, Kalender, Uhrzeiten,
  Vokabular-Dialog) hängen außerhalb des Elements und sind davon nicht
  erfasst.
- **`?viewerMode=true` auf der eigenständigen Seite:** Seit der Korrektur zu
  U-08 d (ein nicht gesetztes `readonly` heißt „Vorgabe des Layouts“) nahm die
  Bindung `[readonly]` der Seite zurück, was `viewerMode` gesetzt hatte. Die
  Seite bindet jetzt `readonly ?? viewerMode`; sind beide angegeben, gewinnt
  `readonly`. Das Attribut `viewer-mode` des Elements war nicht betroffen.
- **`build.json` neben den Bundles (U-17):** `scripts/build-elements.js`
  schreibt `dist/build.json` in das Widget-Verzeichnis des Agenten:
  `name`, `version` (aus `package.json`), `builtAt`, je ausgelieferter Datei
  ein SHA-256 und `hash` über alle (die Zeilen `<sha256>  <pfad>` in der
  Reihenfolge der Pfade). Die Datei wird mit ausgeliefert
  (`/widget/dist/build.json`); das Widget liest sie nicht.

Auslieferung (`scripts/build-elements.js`, U-17):

- Lehnt ein `dist/` ab, in dem eine JavaScript-Datei liegt, die es nicht
  ausliefert (ein nachgeladener Chunk bliebe sonst stillschweigend liegen),
  und eines mit zwei Kandidaten für ein Bundle.
- Erlaubt-Liste statt Verbotsliste für Hosts in den Bundles: `www.w3.org`
  (XML-Namensräume), `angular.dev` (Links in Angulars Fehlermeldungen),
  `example.com` (Platzhalter). Alles andere stoppt die Auslieferung.
- Verlangt `de.json` und `en.json` in `dist/assets/i18n` und prüft, dass
  `main.js` deren Texte enthält (verglichen werden die reinen ASCII-Texte, 62
  deutsche und 105 englische). Die Dateien gehen weiter an den Agenten
  (`/widget/i18n/<sprache>.json`), jetzt zusammen mit den Bundles: erst unter
  `.tmp`, dann gemeinsam umbenannt. Scheitert das Schreiben, bleibt alles, wie
  es war (bisher wurden die Texte nach dem Tausch kopiert).
- Schriften und Lizenztexte werden vor dem Tausch geschrieben; `build.json`
  als Letztes.

Abhängigkeiten (U-10, U-19):

- `ngx-mat-timepicker` (mit `ts-luxon`) und `@angular/animations` sind aus
  `package.json` entfernt; kein Quelltext nutzte sie mehr. `NOTICE` nennt sie
  nicht mehr und führt die vier SVG-Symbole auf.
- `npm audit fix` und ein `npm update` innerhalb der Bereiche von
  `package.json` (nur `package-lock.json`): Angular 21.2.25 → 21.2.26,
  `@angular-devkit/build-angular` → 21.2.30. `npm audit` meldet keinen hohen
  Befund mehr (vorher 1 niedrig, 22 mittel, 7 hoch); `npm audit --omit=dev`
  bleibt bei 0. Die verbliebenen 25 mittleren Meldungen gingen auf zwei
  Hinweise zurück (`glob` 13 unter `pacote` in `@angular/cli`, `minimatch` 10
  unter `typescript-eslint`); `overrides` in `package.json` heben genau diese
  Stellen auf die korrigierten Versionen (`glob` ≥ 14.0.2, `minimatch` ≥
  11.0.1). `npm audit` meldet damit 0 Befunde. Die Overrides können entfallen,
  sobald `@angular/cli` und `typescript-eslint` die Versionen selbst verlangen.
- Der Dev-Audit-Job in `.gitlab-ci.yml` ist jetzt blockierend bei `high`; sein
  Kommentar nennt die tatsächlichen Befunde statt `braces`.
- **Offen (Schulden):** Karma und der Webpack-Builder sind weiter abgekündigt
  (Vitest und `@angular/build:application` als eigenes Release).

ESLint (U-19, W-ARCH-02):

- Neu: ESLint 10 mit `angular-eslint` 21.4 und `typescript-eslint` 8
  (`eslint.config.js`, `npm run lint`, blockierender CI-Job `lint`): die
  empfohlenen Regeln für TypeScript und Vorlagen und die
  Barrierefreiheits-Regeln für Vorlagen. Der Lauf endet ohne Fehler, mit 180
  Warnungen.
- Nicht massenhaft umgeschrieben, sondern mit Begründung in der Konfiguration:
  `no-explicit-any` als Warnung im Anwendungscode (167 Stellen; in Specs aus),
  `no-output-native` als Warnung (13 Ausgänge der Layouts heißen `reset`,
  `cancel`, `submit`), `prefer-inject` aus (35 Konstruktoren),
  `template/prefer-control-flow` aus (180 `*ngIf`/`*ngFor` in 16 Vorlagen).
- Behoben, was eine Zeile war: `Object` als Typ in `WidgetDateAdapter.format`,
  eine nutzlose Zuweisung in `ShapeExpanderService.entriesOf`, ein ungenutztes
  `err` in `build-elements.js`. Zwei Fundstellen von
  `interactive-supports-focus` (Hüllen, die Tasten ihrer Eingabefelder
  abfangen) sind mit Begründung in der Vorlage ausgenommen.

Typprüfung, Budget, CI (U-18, U-20):

- `tsconfig.app.json` (`files: ["src/main.ts"]`) ist die Konfiguration des
  Builds: Specs und `src/app/testing` gehören nicht mehr zur Typprüfung des
  Produktions-Builds. `tsconfig.json` bleibt die Basis für Editor und Specs.
- Budget für das Start-Bundle: Warnung ab 1,4 MB, Fehler ab 1,6 MB (vorher
  1,6 / 2 MB). Gemessen am 14.11.: 1 265 535 Bytes, davon `main.js`
  1 163 375 (263 842 gzip; vor dieser Runde 1 449 737 / 328 747).
  `polyfills.js` setzt keine Zone-Flags mehr (K-25, am Build geprüft); kein
  Verweis auf `ngx-mat-timepicker`, luxon oder `@angular/animations`.
- CI: neuer blockierender Job `lint`; der Build-Job ist zugleich die
  Größenprüfung und legt `elements-check/` (mit `build.json`) als Artefakt ab;
  der Abgleich des Bundles im Agenten gegen `build.json` ist in
  `.gitlab-ci.yml` beschrieben (der Job selbst gehört in die Pipeline des
  Agenten).

Tests (U-16):

- 1281 Specs (vorher 1215). Abdeckung 88,65 / 77,74 / 89,80 / 90,39 %;
  Untergrenzen in `karma.conf.js` jetzt 84 / 73 / 85 / 86 (vorher
  75 / 60 / 72 / 77).
- **Einbettung ohne `styles.css`** (`embedding-without-styles.spec.ts`): Die
  sieben Layouts laufen mit abgeschaltetem globalem Stylesheet, wie
  edu-sharing sie lädt, und ohne Material-Theme eines Hosts: keine
  axe-Verstöße, jedes Bedienelement hat einen Namen, jedes Icon ist ein
  gezeichnetes SVG oder Schmuck (`aria-hidden`), der Fokus ist zu sehen (das
  schlug fehl, siehe oben), Nur-Lese-Werte sind Text.
- Die Tabellen der README (Layout-Matrix, Aliase) werden aus den Presets und
  `MODE_LAYOUT_MAP` erzeugt und mit beiden Sprachfassungen verglichen
  (`readme-tables.spec.ts`).
- Jeder Textschlüssel, der in einer Vorlage oder im Code steht, existiert in
  `de.json` und `en.json` (`i18n-keys.spec.ts`; die Quelltexte werden den
  Specs dafür als Assets ausgeliefert). `WIDGET_VERSION` ist die Version aus
  `package.json` (`version.spec.ts`).
- Property-Bindings eines Templates (im selben Task nach dem Einhängen
  gesetzt): Layout und Datensatz kommen an, das Standard-Layout wird zuvor
  einmal gebaut und ungemalt ersetzt; `context-name` und `schema-version`
  kommen so zu spät (`canvas-element.spec.ts`).
- Wartezeiten auf die 50 ms des `metadataChange` laufen über `jasmine.clock()`
  statt über die Wanduhr (`canvas-metadata-change.spec.ts`,
  `canvas-report-timing.spec.ts`, `canvas-host-import.spec.ts`); `settle()`
  des Harness dreht echte Runden der Ereignisschleife und bedient dabei eine
  gestellte Uhr. Die Specs des Custom Elements behalten echte Zeit (die 10 ms
  sind die von Angular).
- **Offen:** 31 Aufrufe privater Methoden über `as any` in Specs
  (`updateState`, `regenerateWithContentType`, `applyValueToField`,
  `captureScreenshotAsync`, `scheduleMetadataChange`, `parseQueryParams`) –
  sie stellen einen Zustand her, für den es keinen öffentlichen Weg gibt;
  einer ist durch den öffentlichen ersetzt (`startExtraction()` ohne Text
  statt `say()`).

Dokumentation (U-11):

- README (beide Sprachen) gegen den Code geprüft und berichtigt: Reihenfolge
  der Agent-Adresse (`api-url` gewinnt über `window.__ENV.agentUrl`);
  `columns` je Layout (`plugin` kennt nur 2, `detail` ordnet Gruppen);
  `metadataSubmit` nur in `plugin` und `dialog`; flache Gruppen sind eine
  Gruppe für alles; von `environment.ts` wirken `apiUrl` und `logLevel`;
  `--target` nennt den 3.x-Agenten; Property-Bindings und Wiedereinhängen;
  Texte im Bundle; Datensatz-Regeln; neue Abschnitte „Browser-Erweiterung“
  und „Spalten“; Matrix mit `groupCollapse` und allen Preset-Schlüsseln.
  `docs/URL-PARAMETERS*.md`: Herkunft der Adresse, `flatGroups`, `viewerMode`.

## 4.0.0 — Korrekturen aus dem Audit vom 13.11. (Teil desselben Releases)

Befunde aus `metadata-agent-3/docs/audits/2026-11-13-audit-3.0.1.md`
(Abschnitt „Webkomponente“). Attribute und Ereignisse heißen wie in 3.0.1.
Entstanden am 13.11., veröffentlicht mit 4.0.0.

Für Einbettende – Verhalten, das sich ändert:

- **Objektfelder behalten `@type` und fremde Schlüssel (W-LOG-03):** Export,
  Upload, Ereignisse und `existing_metadata` bauten ein Objekt nur aus den
  Unterfeldern der gezeigten Variante. `@type` und jeder Schlüssel ohne
  Unterfeld fielen weg; beim nächsten Öffnen erschien die erste Variante
  (`schema:location`: ein Online-Ort als `Place`-Formular ohne URL). Jetzt ist
  der Eintrag, wie er hereinkam, die Grundlage; die Unterfelder liegen darüber.
  Im Datensatz stehen damit `@type` und zuvor verlorene Schlüssel. Ein im
  Formular neu ausgefülltes Objekt bekommt das `@type` seiner Variante (nicht
  bei „Default“, das keine eigene Art bezeichnet). Ein Objekt ohne `@type`
  gilt als die Variante, deren Unterfelder es hat, bei Gleichstand wie bisher
  als die erste. Einträge einer Variante ohne Unterfelder (`PostalAddress` in
  `event.json`) bleiben erhalten statt zu verschwinden. Ein unberührtes
  Formular wird weiterhin nicht exportiert; `@type` allein zählt nicht als
  Inhalt. Die Objekte der einbettenden Seite werden nicht mehr verändert
  (vorher schrieb das Widget in deren `address`/`geo`).
- **Weniger `metadataChange` (W-LOG-06):** Das Ereignis kam bei jeder
  Zustandsänderung – mit leerem Datensatz beim Start, für Zwischenschritte
  eines Imports und für Änderungen ohne Wirkung auf den Datensatz. Jetzt: kein
  Ereignis, solange das Formular leer ist und nichts gemeldet wurde; genau
  eines nach jedem abgeschlossenen Import (auch bei gleichem Datensatz), nach
  jeder Erschließung und nach jeder Feld-Änderung; sonst nur, wenn sich der
  Datensatz gegenüber dem zuletzt gemeldeten unterscheidet (`exportedAt` zählt
  nicht). Ein `content-type` allein auf leerem Formular löst keines mehr aus,
  ein Zurücksetzen meldet weiter den leeren Datensatz.
- **Geleerte Felder melden `null` (W-LOG-02):** Ein geleertes Text-, Zahl-,
  URL-, Dauer-, JSON- oder Datumsfeld meldete nichts, der alte Wert blieb im
  Datensatz. Gilt auch für Unterfelder: der Schlüssel entfällt im Objekt.
  Listenfelder sind nicht betroffen (ihr Eingabefeld ist nur der Entwurf des
  nächsten Eintrags). Ein unlesbar getipptes Datum wird wieder als Fehler
  gezeigt statt stillschweigend verworfen.
- **Ja/Nein-Felder liefern `true`/`false` (W-LOG-07):** Die Auswahl speicherte
  die Texte `'true'`/`'false'`; nach einer Erschließung (echte Wahrheitswerte)
  war nichts gewählt. Als Text gespeicherte Werte (`'true'`, `'ja'` …) wählen
  weiter die passende Option, bleiben im Datensatz aber Text, bis jemand klickt.
- **Getipptes gilt sofort (W-LOG-01):** Ein Wert erreichte den Datensatz erst
  200 ms nach Verlassen des Feldes; „Hochladen“, „Speichern“ oder der
  JSON-Download direkt danach enthielten den alten Wert. Die Wartezeit gibt es
  nur noch bei offener Vorschlagsliste (Klick auf einen Vorschlag), und die
  drei Aktionen übernehmen Wartendes vorher.
- **`schemaVersion` im Datensatz ist die echte Version (W-LOG-04):** z. B.
  `v2.0.0` statt `vlatest`, sobald der Agent das Basisschema geliefert hat.
  `/generate` läuft mit `schema-version` statt immer mit `latest`.
- **`readonly` sperrt die Inhaltstyp-Wahl (W-LOG-09):** Das Menü ist in allen
  Layouts und in der Statusbar gesperrt; eine Auswahl baute das Formular um und
  startete eine KI-Erschließung. `content-type` der Seite wirkt weiter.
- **Vorschaubild nur von `data:image/…`, `https:` oder dem eigenen Host
  (W-SEC-01):** Adressen fremder Hosts ohne TLS (`http://…`) aus
  `preview-image` oder `preview_image_url` werden nicht mehr geladen; im
  Datensatz bleiben sie. Relative Adressen und solche der einbettenden Seite
  selbst (auch ohne TLS, etwa in der Entwicklung) werden weiter gezeigt.
- **Doku neu gegliedert, Englisch als Standard:** `README.md` (englisch) und
  `README.de.md` (deutsch) mit gleichem Aufbau, ebenso
  `docs/URL-PARAMETERS.md` / `.de.md`. Neu ist der Abschnitt „Vor dem ersten
  Zeichnen konfigurieren“ zum kurz sichtbaren Eingabebereich: Ursache, drei
  funktionierende Wege, Messwerte am Bundle und die kleinste Korrektur für
  edu-sharing (ein statisches `layout`-Attribut im Template).
- **`metadata-input` als Attribut (W-SEC-01):** JSON-Text wird einmal gelesen.
  Vorher wurde er zeichenweise importiert (Schlüssel `0`, `1`, …). Was kein
  einzelnes Objekt ist, wird mit einer Meldung abgelehnt.
- **Neue Texte:** `ALERTS.NETWORK_UNREACHABLE`, `SERVICE_UNAVAILABLE`,
  `SERVICE_TIMEOUT`, `METADATA_INPUT_INVALID`. Sie kommen vom Agenten; bis
  dessen `assets/i18n/` aktualisiert ist, zeigt das Widget dafür seinen
  englischen Ersatztext.

Weitere Korrekturen:

- **Abgelöste Läufe werden abgebrochen (W-PERF-01):** Reset, Import, eine neue
  Erschließung und ein Typwechsel verwarfen nur die Antwort; die Anfrage lief
  am Agenten bis zu 300 s weiter (drei Typwechsel: vier Läufe). Jeder Lauf hat
  jetzt einen `AbortController`. Auch wenn das letzte Element einer Instanz
  verschwindet, wird abgebrochen. Ein Abbruch erscheint nicht als Fehler.
- **Einstellungen der Seite überstehen Reset und `instance-id` (W-LOG-08):**
  `enable-screenshot`, `screenshot-method` und `preview-image` lagen nur im
  Zustand und gingen mit ihm verloren.
- **Kein Absenden fremder Formulare (W-ARCH-01):** 40 Buttons hatten kein
  `type`; in einem `<form>` der Seite schickte ein Klick darauf das Formular
  ab. Alle 51 tragen `type="button"`.
- **Stille Konsole (W-ARCH-01):** „Web Component … registered“ und „Context
  set“ erscheinen nur noch mit `debug="true"`.
- **Lesbare Fehler ohne Antwort des Agenten (W-LOG-10):** Bei fehlender
  Verbindung, 5xx ohne JSON oder Zeitüberschreitung eines Proxys stand im
  Banner Angulars Meldung mit der vollen Adresse. Jetzt eigene Texte, mit
  Anfrage-ID, wenn der Agent eine nennt. Fehler- und Hinweisbanner brechen
  lange Wörter um (die Anfrage-ID hat 32 Zeichen).
- **Hinweise des Agenten sichtbar:** `processing.warnings` („Text auf 150.000
  Zeichen gekürzt“, „Orte bleiben ohne Koordinaten: …“) erscheint nach der
  Erschließung im Hinweisbanner aller Layouts und wird mit deren Ende
  vorgelesen.
- **`layout = null`** oder `removeAttribute('layout')` wirft nicht mehr, es
  gilt das Standard-Layout (W-SEC-01).
- **README (W-DOC-01):** Matrix mit den Presets abgeglichen (`contentType` in
  `dialog` und `detail` aus); Attribute ohne Wirkung benannt (`show-footer`
  überall, `show-field-actions` außer im Gruppenkopf von `default`, Upload,
  Save, Reset und JSON-Loader in Layouts ohne diese Buttons); Lizenz
  Apache-2.0; `docker build` ohne Dockerfile entfernt; i18n-Pfad
  `/widget/i18n/<lang>.json`; `defaultVersion: 'latest'`.
- **Nicht geändert, nur dokumentiert (W-LOG-05):** `api-url`, `context-name`
  und `schema-version` lädt das Widget einmal beim Einhängen. Spätere
  Änderungen von Kontext und Version wirken nicht, ein späteres `api-url` lädt
  kein Schema neu. Steht jetzt im README („API & Schema“).

Tests: 615 Specs (vorher 449), darunter erstmals solche, die einen Wert von der
Tastatur bis zum Ereignis der Seite verfolgen (`src/app/testing/canvas-harness.ts`).
Abdeckung Statements 79,97 %, Branches 66,49 %, Functions 77,60 %, Lines 82,07 %.

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
