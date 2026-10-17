# Änderungen

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
