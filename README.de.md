# Metadata Agent Canvas

[English](README.md) · **Deutsch**

`<metadata-agent-canvas>` ist eine Webkomponente (Angular 21, Angular Elements)
zum Anzeigen und Bearbeiten von Metadatensätzen. Sie ist die Oberfläche der
**Metadata Agent API**: Jeder KI-Schritt – Erschließung, Normalisierung,
Erkennen des Inhaltstyps, Geokodierung, Upload ins Repository – läuft im
Agenten. Die Komponente zeichnet das Formular, prüft Eingaben und meldet den
Datensatz an die einbettende Seite.

```
einbettende Seite                      Metadata Agent API (FastAPI)
┌──────────────────────────┐   HTTP   ┌──────────────────────────────┐
│ <metadata-agent-canvas>  │ ───────► │ Schemata, /generate, /upload,│
│ Formular, Layouts, Texte │          │ /screenshot, Texte, Bundles  │
└──────────────────────────┘          └──────────────────────────────┘
```

## Inhalt

1. [Schnellstart](#schnellstart)
2. [Einbettung](#einbettung)
   - [Dateien](#dateien)
   - [Mit welchem Agenten das Widget spricht](#mit-welchem-agenten-das-widget-spricht)
   - [Vor dem ersten Zeichnen konfigurieren](#vor-dem-ersten-zeichnen-konfigurieren)
   - [Einbettung in edu-sharing](#einbettung-in-edu-sharing)
   - [Zugriff per JavaScript](#zugriff-per-javascript)
3. [Attribute und Properties](#attribute-und-properties)
4. [Layouts](#layouts)
5. [Bedienelemente](#bedienelemente)
6. [Ereignisse und der Datensatz](#ereignisse-und-der-datensatz)
7. [Upload und erweiterte Metadaten](#upload-und-erweiterte-metadaten)
8. [Meldungen an die Redaktion](#meldungen-an-die-redaktion)
9. [Mehrere Widgets auf einer Seite](#mehrere-widgets-auf-einer-seite)
10. [Browser-Erweiterung](#browser-erweiterung)
11. [Eigenständige Seite](#eigenständige-seite)
12. [Fehlersuche](#fehlersuche)
13. [Entwicklung](#entwicklung)
14. [Lizenz](#lizenz)

---

## Schnellstart

Der Agent liefert das Widget selbst aus. Eine Seite braucht das Stylesheet, drei
Skripte und das Element:

```html
<link rel="stylesheet" href="https://AGENT/widget/dist/styles.css">
<script src="https://AGENT/widget/dist/runtime.js" defer></script>
<script src="https://AGENT/widget/dist/polyfills.js" defer></script>
<script src="https://AGENT/widget/dist/main.js" defer></script>

<metadata-agent-canvas layout="default"></metadata-agent-canvas>
```

`AGENT` ist die Adresse, unter der die Seite den Agenten erreicht – direkt oder
über einen Proxy (bei der B-API: `…/api/v1/proxy/metadata-agent-canvas`).
Beispielseiten liefert der Agent unter `/widget/examples/`.

---

## Einbettung

### Dateien

| Datei | Zweck |
|---|---|
| `widget/dist/runtime.js`, `polyfills.js`, `main.js` | Die Komponente samt ihren Texten (Deutsch, Englisch). Alle drei laden, in dieser Reihenfolge |
| `widget/dist/styles.css` | Theme, Schriften und Icons des Widgets |
| `widget/dist/fonts/` | Roboto (300/400/500) und Material Icons, von `styles.css` geladen |
| `widget/dist/build.json` | Was ausgeliefert wurde: Widget-Version, Build-Zeit, ein Hash je Datei. Das Widget lädt sie nicht |

Keine Schrift und kein Skript kommt von einem fremden Host.

**Das Stylesheet bleibt beim Widget.** Schriften registriert es unter eigenen
Namen (`Metadata Agent Roboto`, `Metadata Agent Material Icons`). Theme,
Schrift, Icon-Klassen, `--md-*`-Variablen, Scrollbars und der Fokusrahmen gelten
nur innerhalb von `<metadata-agent-canvas>` und des eigenen Overlay-Containers
(Klasse `metadata-agent-overlays`: Menüs, der Kalender, die Liste der
Uhrzeiten). Eine Host-Seite, die selbst Angular Material nutzt, behält ihre
`--mat-*`-Tokens, ihre Schrift und ihre Icons; `html` und `body` bleiben
unberührt. Global wirken nur die Material-Hilfsklassen `.mat-elevation-z*` und
`.mat-app-background` – dieselben Regeln, die ein Material-Host selbst
mitbringt.

**Ohne `styles.css`** (edu-sharing lädt nur die drei Skripte) gelten Schrift,
Icon-Schrift und Material-Theme der Host-Seite. Was das Widget in `main.js`
trotzdem mitbringt:

- vier Symbole, die edu-sharings Icon-Schrift (Material Symbols) fehlen können,
  als eingebettete SVGs: das Entfernen-Symbol der Chips, `info_outline`,
  `error_outline` und `help_outline`. Alle anderen Icons sind Schmuck an
  Bedienelementen, die einen eigenen Namen haben;
- den Fokusrahmen seiner Buttons und Links und den Rahmen des fokussierten
  Eingabefelds;
- die Nur-Lese-Darstellung, die Banner und den Aufbau des Formulars.

Die Overlays des Widgets (Typ-Menü, Kalender, Liste der Uhrzeiten,
Vokabular-Dialog) hängen unter `<body>` und nehmen ihr Aussehen allein aus dem
Theme des Hosts.

Eigene Icons der Host-Seite brauchen eigene Icon-Styles; die Beispielseiten des
Agenten binden dafür `examples/demo-icons.css` ein.

### Mit welchem Agenten das Widget spricht

Das Erste, das gesetzt ist:

1. das Attribut `api-url` bzw. die Property `apiUrl`;
2. `window.__ENV.agentUrl`, gesetzt bevor die Skripte laufen;
3. die Adresse, von der das Bundle geladen wurde – alles vor `/widget/dist/`,
   einschließlich eines Proxy-Präfixes;
4. Pfade auf demselben Host.

Vom Agenten geladen braucht das Widget also gar keine Adresse. Pfad
`/widget/dist/` und Dateinamen sollten bleiben; wer sie ändert, setzt `api-url`.

```html
<!-- optional: eine Proxy-Basis, vor den Skripten -->
<script>window.__ENV = { agentUrl: '/api/v1/proxy/metadata-agent-canvas' };</script>
```

Die Adresse gilt je Seite: Das zuletzt gesetzte `api-url` gilt für alle
Widgets. Wann `api-url`, `context-name` und `schema-version` wirken, steht unter
[Verbindung und Schema](#verbindung-und-schema).

### Vor dem ersten Zeichnen konfigurieren

**Symptom:** Für Sekundenbruchteile – auf einer beschäftigten Seite bis zu
1–2 s – erscheint der Eingabebereich des Standard-Layouts, obwohl die Seite ein
Layout ohne ihn verwendet (`clean`, `detail`, ein Prüftisch).

**Ursache:** Das Widget zeichnet sich, sobald es im DOM hängt und registriert
ist, mit den Einstellungen, die es in diesem Moment hat. Ohne Einstellungen ist
das das Standard-Layout, mit Eingabebereich. Setzt die Seite `layout`,
`readonly` usw. erst danach – nach einem `await`, in einem `setTimeout`, nach
dem Laden der Skripte –, steht bis dahin das Standard-Layout da. Das Widget kann
nicht wissen, dass noch Einstellungen kommen.

**Regel:** Das Element hat seine Einstellungen, bevor es eingehängt wird.
Asynchron darf nur das Laden der Skripte sein.

Drei Wege; der erste und der dritte sind für jede Einstellung sicher:

1. **Attribute im Markup.** Zugleich die kleinste Korrektur für eine bestehende
   Einbindung: Ein statisches Attribut entscheidet das erste Bild, alles Weitere
   darf weiterhin später kommen.

   ```html
   <metadata-agent-canvas layout="clean"></metadata-agent-canvas>
   ```

2. **Property-Bindings im Template des Hosts.** Angular setzt sie, wenn das
   Element schon im Dokument hängt – im selben Task, es wird also nichts
   Falsches gemalt, aber nachdem das Widget gestartet ist. (Ein Framework, das
   Properties setzt, bevor es das Element einfügt, ist Weg 3.)

   ```html
   <metadata-agent-canvas context-name="mds_oeh" schema-version="2.0.0"
                          [layout]="viewer ? 'detail' : 'clean'"
                          [metadataInput]="record"
                          (metadataChange)="onChange($event)">
   </metadata-agent-canvas>
   ```

   - `layout`, `readonly`, `metadataInput` und die übrigen
     Darstellungs-Einstellungen kommen so an, wie sie gebunden sind. Das
     Standard-Layout wird zuerst gebaut und ersetzt, bevor der Browser malt; ein
     `MutationObserver` sieht dessen Eingabebereich für diesen Moment.
   - `context-name` und `schema-version` kommen so **zu spät**: Das Schema wird
     mit den Standardwerten geladen. Diese beiden – und ein `api-url`, das von
     der Herkunft der Skripte abweicht – als statische Attribute schreiben.

3. **Properties per Skript, vor `appendChild` und vor jedem `await`.** Das geht
   auch, wenn die Skripte noch nicht geladen sind: Properties, die vor der
   Registrierung der Komponente am Element gesetzt wurden, übernimmt sie beim
   Start, vor dem ersten Bild.

   ```js
   const el = document.createElement('metadata-agent-canvas');
   el.layout = 'clean';
   el.showCoreFields = false;
   el.metadataInput = record;
   container.appendChild(el);
   loadWidgetScripts();            // darf später laufen, darf asynchron sein
   ```

Was **nicht** funktioniert:

```js
container.appendChild(document.createElement('metadata-agent-canvas'));
await loadWidgetScripts();         // hier startet das Widget, im Standard-Layout
el.layout = 'clean';               // für das erste Bild zu spät
```

Die Specs des Elements (`src/app/canvas-element.spec.ts`) halten das fest: Vor
dem Einhängen konfiguriert – per Properties oder allein per Attribut – kommt der
Eingabebereich nie ins DOM; 150 ms nach dem Einhängen konfiguriert steht er da,
bis die Einstellungen eintreffen.

Zum Prüfen einer Einbindung das Element ab seiner Entstehung beobachten:

```js
new MutationObserver(() => {
  if (el.querySelector('.input-section, .input-area')) console.warn('Eingabebereich gezeichnet');
}).observe(el, { childList: true, subtree: true });
```

**Ein Element, das aus dem Dokument genommen und wieder eingehängt wird** (ein
Tab, ein Dialog, eine umsortierte Liste):

- im selben Task verschoben, bleibt es, wie es ist – samt Formular und
  Eingaben;
- länger draußen (Angular zerstört die Komponente 10 ms, nachdem das Element das
  Dokument verlassen hat), startet es beim Zurückkommen neu, mit allem, was der
  Host an ihm gesetzt hatte: Attribute und Properties, auch der Datensatz aus
  `metadataInput`. Es nimmt Eingaben an und meldet Änderungen wie zuvor, auch
  nach dem zweiten und dritten Zurückkommen;
- es kommt mit dem **letzten Datensatz des Hosts** zurück, nicht mit dem, was
  die Redaktion seither getippt hat – ein Host, der Eingaben behalten will, gibt
  den Datensatz des letzten `metadataChange` als neues Objekt wieder hinein;
- `auto-extract` und `force-reset` werden beim Zurückkommen nicht wiederholt.

### Einbettung in edu-sharing

edu-sharing lädt `runtime.js`, `polyfills.js` und `main.js` selbst (ohne
`styles.css`) und zeigt das Widget an zwei Stellen:

| Stelle | Layout | Datensatz |
|---|---|---|
| Formular-Editor, Feld `ccm:oeh_extendedData` | `clean`; beim Ansehen `detail`, nur lesen | `ccm:oeh_extendedData` + `contentType` aus `ccm:oeh_extendedType` |
| Detailansicht (`wlo-extended-content-types`) | `detail`, nur lesen | derselbe |

Stand 10/2026 setzt edu-sharing die Werte erst nach `await initWebComponent()`,
im Formular-Editor zusätzlich in einem `setTimeout`. Bis dahin ist der
Eingabebereich zu sehen ([siehe oben](#vor-dem-ersten-zeichnen-konfigurieren);
2.1.1 verhielt sich genauso).

**Kleinste Korrektur: die Einstellungen als Attribute in die beiden
Templates.** Attribute stehen am Element, bevor die Skripte es starten, und
entscheiden damit das erste Bild. Die späteren Zuweisungen von edu-sharing
bleiben, wie sie sind; sie setzen dieselben Werte noch einmal.

Formular-Editor, wie edu-sharing ihn zeigt: Titel, Beschreibung usw. zeichnet
edu-sharing selbst, darunter folgen direkt die Felder des Inhaltstyps (bei einer
Veranstaltung „Event-Typisierung“, „Termin & Status“ …). Also ohne
Eingabebereich, ohne Basisfelder, ohne schwebende Leiste:

```html
<!-- Formular-Editor, Feld ccm:oeh_extendedData -->
<metadata-agent-canvas #canvas
    [attr.layout]="viewer ? 'detail' : 'clean'"
    [attr.readonly]="viewer ? 'true' : null"
    [attr.columns]="groupId === 'io_render' ? 4 : 1"
    [attr.language]="language"
    show-input-area="false"
    show-core-fields="false"
    show-floating-controls="false"
    highlight-ai="true">
</metadata-agent-canvas>
```

```html
<!-- Detailansicht (wlo-extended-content-types) -->
<metadata-agent-canvas #canvas
    layout="detail"
    readonly
    columns="1"
    borderless="true"
    background-color="transparent"
    show-floating-controls="false"
    [attr.language]="language">
</metadata-agent-canvas>
```

- `viewer`, `groupId` und `language` stehen für die Werte, die der Code von
  edu-sharing heute nach dem Laden zuweist (`mdsEditorInstance.editorMode ===
  'viewer'`, `mdsEditorInstance.groupId`, die Sprache von edu-sharing). Als
  Attribut-Binding (`[attr.…]`) setzt Angular sie in derselben Change Detection,
  die das Element anlegt (`this.cdr.detectChanges()`), also vor dem Laden der
  Skripte.
- `layout="clean"` allein hat schon keinen Eingabebereich
  ([Matrix](#standardwerte-je-layout)); `show-input-area="false"` hält das fest,
  auch wenn die Seite das Layout später wechselt.
- `show-core-fields="false"` zählt, sobald ein Datensatz da ist: Ohne Datensatz
  zeichnet das Widget noch keine Felder. Kommt `metadataInput` vor
  `showCoreFields` an, wären Titel und Beschreibung für diesen Moment zu sehen.
- `apiUrl`, `metadataInput` und die Ereignis-Handler bleiben im Code von
  edu-sharing; sie verändern das erste Bild nicht.

Geprüft im Browser mit einer Seite, die edu-sharing nachbildet (Element im
Markup, Skripte danach geladen, Werte 2 s später gesetzt): Ohne Attribute waren
Eingabebereich und schwebende Leiste zu sehen, mit den Attributen oben nichts
davon. Prüfen lässt sich eine Einbindung mit dem `MutationObserver` aus dem
[Abschnitt oben](#vor-dem-ersten-zeichnen-konfigurieren).

**Vollständige Korrektur:** erst konfigurieren, dann die Skripte laden.

Formular-Editor (MDS-Widget für `ccm:oeh_extendedData`):

```ts
this.show = r;
this.cdr.detectChanges();                  // legt <metadata-agent-canvas> an
if (!r) return;

// Sofort konfigurieren, nicht erst nach dem Laden der Skripte.
const el = this.canvas.nativeElement;
const viewer = this.mdsEditorInstance.editorMode === 'viewer';
el.apiUrl = Od.getBaseUrl(this.deskService); // derselbe Wert, den initWebComponent liefert
el.language = language;                      // 'de' oder 'en', die Sprache von edu-sharing; der Umschalter des Widgets ist hier ausgeblendet
el.layout = viewer ? 'detail' : 'clean';
el.readonly = viewer;
el.columns = this.mdsEditorInstance.groupId === 'io_render' ? 4 : 1;
el.showFloatingControls = false;
el.highlightAi = true;
el.showCoreFields = false;
el.metadataInput = {
  ...JSON.parse(props['ccm:oeh_extendedData']?.[0] || '{}'),
  contentType: props['ccm:oeh_extendedType']?.[0],
};
el.addEventListener('metadataChange', (e) => { /* wie bisher */ });

// Nur noch die Skripte laden (tut nichts, wenn das Widget schon registriert ist).
this.ngZone.runOutsideAngular(() => Od.initWebComponent(this.deskService));
```

Detailansicht:

```ts
ngAfterViewInit() {
  const el = this.canvas.nativeElement;      // zuerst konfigurieren …
  const props = this.node().properties;
  el.apiUrl = n.getApiUrl();
  el.language = language;
  el.layout = 'detail';
  el.readonly = true;
  el.columns = 1;
  el.borderless = true;
  el.backgroundColor = 'transparent';
  el.showFloatingControls = false;
  el.metadataInput = {
    ...JSON.parse(props['ccm:oeh_extendedData']?.[0] || '{}'),
    contentType: props['ccm:oeh_extendedType']?.[0],
  };
  n.initWebComponent(this.deskService);      // … dann die Skripte laden
}
```

Ist das Widget schon registriert, wenn dieser Code läuft (ein zweiter Node), ist
das Element im selben Task im Standard-Layout gestartet; das hier gesetzte
Layout ersetzt es, bevor etwas gemalt wird (Weg 2 oben).

Anmerkungen zu diesen beiden Einbindungen:

- **`contentType` im Datensatz** nennt dessen Typ, wo der Datensatz kein
  `metadataset`, `metadataset_uri` oder `schemaFile` hat; ein Feld wird daraus
  nie. Ein Typ im Datensatz geht dem `content-type` des Elements vor. Ein
  Datensatz mit `metadataset` – auch `core.json` – gilt als typisiert; sein
  Schlüssel `contentType` wird dann nicht gelesen. Die Property `contentType`
  setzt der Formular-Editor bei einer Änderung des Inhaltstyps weiter wie
  bisher.
- **`language`** – aus der Sprache von edu-sharing setzen. Ohne sie nimmt das
  Widget die gemerkte Wahl seines eigenen Umschalters, dann das nächste
  `lang`-Attribut oberhalb des Elements, dann die Sprache des Browsers.
- **Wiedereinhängen** (Tabs, Dialoge): siehe
  [oben](#vor-dem-ersten-zeichnen-konfigurieren).

**Was eine Einbindung vom Datensatz erwarten sollte** (siehe
[Ereignisse und der Datensatz](#ereignisse-und-der-datensatz)): kein
`metadataChange` für ein leeres Formular beim Start, eines nach jedem Import;
nach einer Eingabe kommt das Ereignis, bevor der Blur-Handler des Feldes
zurückkehrt; ein Feld ohne Wert steht **nicht im Datensatz**, ein von der
Redaktion geleertes Feld ist `null`; keine leeren Listen oder Objekte; Objekte
behalten ihr `@type`; Ja/Nein-Felder sind `true`/`false`. Ein Host, der den
Datensatz des Ereignisses in seinen eigenen mischt, liest einen fehlenden
Schlüssel als „kein Wert“.

### Zugriff per JavaScript

```js
const canvas = document.querySelector('metadata-agent-canvas');

// Vorbefüllen. Ohne eigenen Typ nimmt der Datensatz den Inhaltstyp, den die
// Seite gesetzt hat (content-type / contentType, auch danach gesetzt).
canvas.metadataInput = { 'cclom:title': 'Mein Titel', 'cclom:general_keyword': ['Mathe'] };

// Zur Laufzeit ändern
canvas.layout = 'dialog';
canvas.readonly = true;
canvas.inputMode = 'url';
canvas.contentType = 'event.json';
canvas.language = 'en';

// Zurücklesen, was gesetzt wurde; undefined für nie Gesetztes
canvas.layout;                     // 'dialog'

// Version des geladenen Widgets
customElements.get('metadata-agent-canvas').widgetVersion;

canvas.addEventListener('metadataChange', (e) => console.log(e.detail));
```

- `metadataInput` und `contentType` werden in der Reihenfolge angewendet, in der
  sie gesetzt werden.
- Ein **neues Objekt** ist ein neuer Datensatz. Dasselbe Objekt noch einmal
  zugewiesen – auch nachdem es an Ort und Stelle geändert wurde – wird nicht
  erneut importiert.
- `metadataInput = null` leert nichts; `forceReset = true` leert das Formular.
- Nicht zur Laufzeit: `contextName`, `schemaVersion`
  ([Verbindung und Schema](#verbindung-und-schema)).

---

## Attribute und Properties

Jede Einstellung gibt es als HTML-Attribut (`kebab-case`) und als Property
(`camelCase`).

- Wahrheitswerte als Attribut sind die Texte `"true"` / `"false"`. Das bloße
  Attribut `readonly` bedeutet `true`.
- **Nicht gesetzt** – das Attribut entfernt, die Property `undefined` oder
  `null` – gibt die Entscheidung an das Layout zurück (`readonly`, `borderless`,
  `columns` und die `show-…`-Einstellungen der
  [Matrix](#standardwerte-je-layout)) bzw. an den eigenen Standardwert der
  Einstellung (`flat-groups`, `highlight-ai`, `show-preview`, `show-page-mode`,
  `show-content-type-only`).
- `show-core-fields`, `show-special-fields`, `show-field-actions`,
  `show-preview`, `highlight-ai` und `enable-screenshot` sind bei jedem Wert
  außer `false` an.
- Eine Property zu lesen liefert, was der Host zuletzt gesetzt hat.

### Verbindung und Schema

| Attribut | Property | Standard | Bedeutung |
|---|---|---|---|
| `api-url` | `apiUrl` | siehe [Welcher Agent](#mit-welchem-agenten-das-widget-spricht) | Adresse bzw. Proxy-Basis des Agenten |
| `context-name` | `contextName` | `default` | Schema-Kontext |
| `schema-version` | `schemaVersion` | `latest` | Schema-Version, für das Formular und für die Erschließung (`/generate`) |

**Vor dem Einhängen setzen.** Schema und Inhaltstypen lädt das Widget, wenn das
Element eingehängt und registriert ist, mit den Werten, die in diesem Moment
gelten.

- `contextName` und `schemaVersion` nach einem gelungenen Laden zu setzen hat
  **keine Wirkung**.
- Ein später gesetztes `apiUrl` gilt für alle folgenden Aufrufe (Erschließung,
  Upload, Texte). Schema und Inhaltstypen werden **nicht** neu geladen – es sei
  denn, das erste Laden war gescheitert: Dann wird die neue Adresse versucht
  (ebenso beim nächsten Import und bei der nächsten Erschließung), und die
  Fehlermeldung verschwindet, sobald es geklappt hat. Nennt es denselben Agenten
  wie die Herkunft der Skripte – so setzt es edu-sharing –, ändert sich nichts.

Wer Kontext oder Version wechseln muss, entfernt das Element und legt ein neues
an. Agent, Kontext und geladene Schemata teilen sich alle Widgets einer Seite
([Mehrere Widgets](#mehrere-widgets-auf-einer-seite)).

### Daten

| Attribut | Property | Bedeutung |
|---|---|---|
| `metadata-input` | `metadataInput` | Datensatz zum Vorbefüllen: der Export des Widgets (`{ metadataset, metadata: {…} }`) oder flach, wie der Agent ihn antwortet. Als Property ein Objekt, als Attribut dessen JSON-Text; alles andere wird mit einer Meldung abgelehnt und lässt das Formular, wie es ist |
| `content-type` | `contentType` | Inhaltstyp: Schema-Dateiname (`event.json`) oder die URI des Typs. `core.json` = nur die Basisfelder |

### Layout und Darstellung

| Attribut | Property | Standard | Bedeutung |
|---|---|---|---|
| `layout` | `layout` | `default` | Layout-Preset, siehe [Layouts](#layouts) |
| `language` | `language` | – | `de` oder `en`. Geht der Wahl vor, die der Sprachumschalter gemerkt hat; wird selbst nicht gemerkt. Ohne sie: die gemerkte Wahl, dann das nächste `lang` oberhalb des Elements, dann die Sprache des Browsers, dann Deutsch. Wo der Umschalter zu sehen ist, ersetzt die Wahl der Redaktion sie, bis der Host sie erneut setzt. Eine Sprache für alle Widgets einer Seite |
| `readonly` | `readonly` | `false` (`detail`, `prueftisch-org`: `true`) | Werte als Text, keine Eingabe, leere Felder ausgeblendet; das Menü der Inhaltstyp-Wahl ist gesperrt |
| `viewer-mode` | `viewerMode` | – | Alter Name für `readonly` |
| `columns` | `columns` | je Layout | 1–4 Spalten, siehe [Spalten](#spalten) |
| `borderless` | `borderless` | je Layout | Ohne Rahmen und Schatten |
| `background-color` | `backgroundColor` | – | CSS-Hintergrundfarbe |
| `input-mode` | `inputMode` | `text` | `text`, `url` oder `nodeId` |
| `highlight-ai` | `highlightAi` | `false` | Werte der KI violett, bis die Redaktion sie ändert |
| `flat-groups` | `flatGroups` | `false` | Alle Felder in einer Gruppe, siehe [Bedienelemente](#bedienelemente) |
| `instance-id` | `instanceId` | `default` | Siehe [Mehrere Widgets auf einer Seite](#mehrere-widgets-auf-einer-seite) |
| `debug` | `debug` | `false` | Ausgaben in der Browser-Konsole; gilt für alle Widgets der Seite |

### Sichtbarkeit der Elemente

Die Standardwerte hängen vom Layout ab ([Matrix](#standardwerte-je-layout)).

| Attribut | Property | Element |
|---|---|---|
| `show-input-area` | `showInputArea` | Eingabebereich mit Modus-Umschalter (Text / URL / Node-ID) |
| `show-status-bar` | `showStatusBar` | Statusleiste: Inhaltstyp, Feldzähler, Fortschritt. Zu sehen, sobald das Formular Felder hat |
| `show-core-fields` | `showCoreFields` | Basisfelder (Titel, Beschreibung, Schlagworte, …) |
| `show-special-fields` | `showSpecialFields` | Felder des Inhaltstyps |
| `show-floating-controls` | `showFloatingControls` | Die schwebende Leiste insgesamt. `controls` ist ein alter Name dafür |
| `show-content-type` | `showContentType` | Inhaltstyp-Button in der schwebenden Leiste |
| `show-content-type-only` | `showContentTypeOnly` | Blendet die Aktions-Buttons und den Sprachumschalter der schwebenden Leiste aus; der Inhaltstyp-Button bleibt, wenn `show-content-type` ihn zeigt |
| `show-upload-button` | `showUploadButton` | Upload ins Repository – nur `default`, `plugin`, `dialog` |
| `show-save-button` | `showSaveButton` | Speichern – nur `default` (JSON-Download), `plugin`, `dialog` (`metadataSubmit`) |
| `show-reset-button` | `showResetButton` | Zurücksetzen in der schwebenden Leiste – nur `default`, `plugin`, `dialog` |
| `show-json-loader` | `showJsonLoader` | JSON-Datei laden – nur `default` |
| `show-language-switcher` | `showLanguageSwitcher` | Sprachumschalter (DE/EN) |
| `show-field-actions` | `showFieldActions` | Nur `default`: Schema-Badge und Zähler im Gruppenkopf |
| `show-page-mode` | `showPageMode` | Nur `plugin`: der Button „Webseite laden“ im Eingabebereich, siehe [Browser-Erweiterung](#browser-erweiterung) |
| `show-preview` | `showPreview` | Vorschaubild über den Gruppen (Standard `true`) |
| `show-footer` | `showFooter` | Ohne Wirkung – kein Layout hat eine Fußzeile; aus Kompatibilität angenommen |

Attribute für ein Element, das ein Layout nicht hat, werden angenommen und
ignoriert.

### Vorschaubild und Screenshot

| Attribut | Property | Standard | Bedeutung |
|---|---|---|---|
| `enable-screenshot` | `enableScreenshot` | `true` | Screenshot beim Erschließen aus einer URL; die Redaktion kann ihn im Eingabebereich umschalten |
| `screenshot-method` | `screenshotMethod` | `playwright` | Geht an den Agenten, der das Bild mit seinem eigenen Browser aufnimmt. `pageshot` wird als alter Name angenommen; andere Werte werden ignoriert |
| `preview-image` | `previewImage` | – | Ein Vorschaubild vom Host. Gezeigt werden `data:image/…`, `https:`-Adressen und Adressen des eigenen Hosts der Seite, auch relative. Dieselbe Regel gilt für `preview_image_url` eines importierten Datensatzes |

Bei einem Text statt einer URL folgt ein Screenshot, wenn der erschlossene
Datensatz eine URL enthält (`ccm:wwwurl`).

### Für eine Browser-Erweiterung

`text`, `url`, `auto-extract`, `force-reset` und das DOM-Ereignis
`plugin-extract` stehen unter [Browser-Erweiterung](#browser-erweiterung).

---

## Layouts

| Layout | Einsatz |
|---|---|
| `default` | Eigenständig, gehostete Seite, Bookmarklet – alles sichtbar |
| `plugin` | Browser-Erweiterung, kompakte Seitenleiste |
| `dialog` | Redaktionsdialog, Prüfung eines Datensatzes |
| `detail` | Detailansicht, Vorschau, Druck – nur lesen, 4 Spalten |
| `clean` | Rahmenlos, minimal, für Einbettung und Prüfung |
| `prueftisch` | Prüftisch von edu-sharing (`columns="2"` für die breite Form) |
| `prueftisch-org` | Organisatorischer Prüftisch, nur lesen |

### Standardwerte je Layout

Die Presets, wie sie in `src/app/shared/layouts/presets/` stehen – ein Spec
(`src/app/readme-tables.spec.ts`) erzeugt diese Tabelle aus ihnen und schlägt
fehl, wenn beide voneinander abweichen.

<!-- layout-matrix:start -->
| Preset-Schlüssel | `default` | `plugin` | `dialog` | `detail` | `clean` | `prueftisch` | `prueftisch-org` |
|---|---|---|---|---|---|---|---|
| `inputArea` | true | true | false | false | false | false | false |
| `statusBar` | true | true | false | false | false | false | false |
| `coreFields` | true | true | true | true | true | true | true |
| `specialFields` | true | true | true | true | true | true | true |
| `fieldActions` | true | false | false | false | false | false | false |
| `groupCollapse` | true | true | false | false | true | true | false |
| `floatingControls` | true | true | true | true | true | true | true |
| `contentTypeSelector` | true | true | false | false | true | true | true |
| `jsonLoader` | true | false | false | false | false | false | false |
| `saveButton` | true | true | true | false | false | false | false |
| `uploadButton` | true | true | false | false | false | false | false |
| `floatingResetButton` | true | true | true | false | false | false | false |
| `languageSwitcher` | true | true | true | true | true | true | true |
| `readonly` | false | false | false | true | false | false | true |
| `columns` | 1 | 1 | 1 | 4 | 1 | 1 | 1 |
| `borderless` | false | true | true | true | true | true | true |
<!-- layout-matrix:end -->

Jeder Schlüssel hat sein Attribut (`inputArea` → `show-input-area`,
`contentTypeSelector` → `show-content-type`, `floatingResetButton` →
`show-reset-button`, …), mit einer Ausnahme: `groupCollapse` – ob sich eine
Gruppe an ihrem Kopf einklappen lässt – hat keines, es gehört zum Layout.

Ein `false` lässt sich per Attribut einschalten, wo das Layout das Element hat.
Was ein Layout **nicht** hat, gleich was das Attribut sagt:

| Layout | Ohne Wirkung |
|---|---|
| `default` | `show-page-mode` |
| `plugin` | `show-json-loader`, `show-field-actions` |
| `dialog` | `show-json-loader`, `show-field-actions`, `show-page-mode` |
| `detail`, `clean`, `prueftisch`, `prueftisch-org` | `show-upload-button`, `show-save-button`, `show-reset-button`, `show-json-loader`, `show-field-actions`, `show-page-mode` |

### Spalten

`columns` nennt die größte Zahl der Spalten; ein schmales Widget zeigt weniger
(eine Spalte ist mindestens 300 px breit).

- `default`, `dialog`, `clean`, `prueftisch`, `prueftisch-org`: 2, 3 oder 4
  Spalten mit Feldern innerhalb jeder Gruppe.
- `plugin`: 2 Spalten; 3 und 4 verhalten sich wie 1.
- `detail` (Standard 4): In den Spalten stehen die **Gruppen**, die Felder einer
  Gruppe untereinander. Mit `flat-groups` bilden die Felder die Spalten.

### Aliase

Weitere Namen, die ein Layout wählen (`MODE_LAYOUT_MAP` in
`src/app/shared/layouts/layout.models.ts`; erzeugt und geprüft wie die Matrix).
Ein Alias wählt das Layout und ändert sonst nichts – `readonly` als Layout-Name
ist das Standard-Layout, keine Nur-Lese-Ansicht.

<!-- layout-aliases:start -->
| Alias | Layout |
|---|---|
| `standalone`, `local`, `normal`, `edit`, `bookmarklet`, `webcomponent`, `embed`, `embedded`, `viewer`, `view`, `readonly` | `default` |
| `browser-extension`, `extension`, `sidebar` | `plugin` |
| `modal`, `review`, `redaktion` | `dialog` |
| `preview`, `print` | `detail` |
| `metadatenpruefdialog`, `pruefung`, `validation`, `check` | `clean` |
| `reviewtable`, `table`, `qa`, `prueftisch-gross`, `prueftisch-large`, `reviewtable-large`, `qa-large` | `prueftisch` |
| `reviewtable-org`, `qa-org`, `prueftisch-org-large`, `reviewtable-org-large`, `qa-org-large` | `prueftisch-org` |
<!-- layout-aliases:end -->

Ein unbekannter Name fällt ohne Meldung auf `default` zurück.

### Beispiele

```html
<!-- nur lesen, beliebiges Layout -->
<metadata-agent-canvas layout="default" readonly="true"></metadata-agent-canvas>

<!-- Dialog mit Eingabebereich und Statusleiste (dort sonst aus) -->
<metadata-agent-canvas layout="dialog" show-input-area="true" show-status-bar="true" input-mode="url"></metadata-agent-canvas>

<!-- Browser-Erweiterung -->
<metadata-agent-canvas layout="plugin" input-mode="url" show-page-mode="true"></metadata-agent-canvas>

<!-- Prüftisch, Inhaltstyp von der Seite gesetzt -->
<metadata-agent-canvas layout="prueftisch" content-type="event.json"></metadata-agent-canvas>

<!-- nur Basisfelder, keine schwebende Leiste -->
<metadata-agent-canvas show-special-fields="false" show-floating-controls="false"></metadata-agent-canvas>
```

---

## Bedienelemente

**Eingabebereich** (`show-input-area`): Modus-Umschalter (Text / URL / Node-ID),
ein Textfeld oder ein einzeiliges Feld, der Button, der die Erschließung startet
(Strg+Enter im Text), Zurücksetzen und der Screenshot-Schalter. `input-mode`
wählt den Modus. Während einer Erschließung sind die Eingaben nur lesbar und
behalten den Fokus.

**Fortschrittszeile:** Während einer Erschließung zeigt jedes Layout eine Zeile
mit „Extraktion abbrechen“. Abbrechen stoppt die Anfrage; das Formular bleibt,
wie es ist, und es folgt keine Meldung. Das Menü der Inhaltstyp-Wahl, der
Zurücksetzen- und der Upload-Button sind so lange gesperrt.

**Statusleiste** (`show-status-bar`): Menü der Inhaltstyp-Wahl, Zähler
(„Felder: 3/31“, „Pflicht: 3/4“) und ein Fortschrittsbalken.

**Schwebende Leiste** (`show-floating-controls`): Inhaltstyp, JSON-Loader,
Speichern, Upload, Zurücksetzen – in dieser Reihenfolge in jedem Layout, das sie
hat – und der Sprachumschalter, jeweils mit eigenem Attribut. Speichern und
Upload sind gesperrt, solange das Formular nichts enthält. Der
Zurücksetzen-Button des Eingabebereichs gehört zu `show-input-area`.

**Menü der Inhaltstyp-Wahl:** Eine Auswahl baut das Formular um. Werte von
Feldern, die beide Typen haben, bleiben; die Werte der übrigen Felder kommen
zurück, wenn die Redaktion zurückwechselt. Stammt das Formular aus einer Quelle
(ein Text, eine URL, ein Node) und ist für den neuen Typ noch nichts gemerkt,
startet eine Erschließung für diesen Typ. Bei `readonly` und während einer
Erschließung ist das Menü gesperrt (auch in der Statusleiste); die Seite kann
den Typ weiter mit `content-type` setzen.

**Felder:** Vokabulare mit Vorschlagsliste (offen und geschlossen), ein Dialog
mit Suche für größere oder hierarchische Vokabulare (200 Einträge auf einmal,
„Weitere Einträge anzeigen“), Radio-Buttons für Ja/Nein und für geschlossene
Vokabulare mit zwei bis vier Werten, ein Kalender für Datumswerte, eine Liste
der Uhrzeiten in Schritten von 15 Minuten neben der Zeiteingabe, Chips für
Listen. Die Beschreibung eines Feldes steht darunter. Objekte (Orte, Personen,
Zeitpläne) werden in Unterfelder aufgefächert:

```
schema:location
  → Name
  → Adresse → Straße, PLZ, Stadt
  → Geo → Breitengrad, Längengrad
```

Eine Liste von Objekten hat „Eintrag hinzufügen“ unter ihrem letzten Eintrag und
„Eintrag entfernen“ an jedem Eintrag. Hat ein Feld mehrere Varianten
(`schema:location`: `Place`, `VirtualLocation`), zeigt das Formular die
Unterfelder der Variante, die das `@type` des Objekts nennt; ohne `@type` die,
deren Unterfelder das Objekt hat.

**Nur lesen** (`readonly`, die Layouts `detail` und `prueftisch-org`): Werte
sind Text, Listen sind Listen, Webadressen sind Links, die in einem neuen Tab
öffnen. Felder ohne Wert werden nicht gezeigt.

**Flache Gruppen** (`flat-groups`): Die Felder aller Gruppen – Basisschema und
Inhaltstyp – werden eine Gruppe, mit dem Inhaltstyp als Überschrift (ohne
einen: „Alle Felder“). `show-core-fields` und `show-special-fields` bestimmen
weiter, welche Felder darin stehen.

**KI-Werte** (`highlight-ai`): Werte des Agenten sind violett und tragen eine
kleine Markierung, bis die Redaktion sie ändert.

---

## Ereignisse und der Datensatz

| Ereignis | Wann | `detail` |
|---|---|---|
| `metadataChange` | Der Datensatz hat sich geändert | der Datensatz |
| `metadataSubmit` | Die Redaktion hat im Layout `plugin` („An Plugin senden“) oder `dialog` („Speichern“) den Speichern-Button gedrückt | der Datensatz |
| `uploadResult` | Nach einem Upload ins Repository, auch einem abgelehnten | `{ success, nodeId?, error?, duplicate?, repositoryUrl? }` |
| `reloadFromPage` | Die Redaktion hat „Webseite laden“ gedrückt (Layout `plugin`, `show-page-mode`) | – |

Im Layout `default` lädt Speichern den Datensatz als JSON-Datei herunter
(`metadata-<Datum>.json`); von dort kommt kein `metadataSubmit`. Die übrigen
vier Layouts haben keinen Speichern-Button.

**`metadataChange` kommt**

- einmal nach jedem abgeschlossenen Import (`metadata-input`, JSON-Datei) –
  auch wenn der Datensatz dem zuletzt gemeldeten gleicht;
- nach einer Eingabe der Redaktion **sofort**: Wenn ein Feld seinen Wert
  übergibt (beim Verlassen, beim Wählen eines Werts), kommt das Ereignis, bevor
  dieser Handler zurückkehrt;
- nach einer Erschließung und bei anderen Änderungen 50 ms später, wenn sich der
  Datensatz vom zuletzt gemeldeten unterscheidet (`exportedAt` zählt nicht);
- **nicht** beim Start, solange das Formular leer ist, und nicht für
  Zwischenschritte eines Imports oder einer Erschließung. Ein `content-type`
  allein auf leerem Formular löst keines aus; ein Zurücksetzen meldet den leeren
  Datensatz.

Getipptes gilt sofort: Speichern, Upload und JSON-Download übernehmen, was ein
Feld noch nicht übergeben hat.

**Der Datensatz**

```json
{
  "contextName": "default",
  "schemaVersion": "v2.0.0",
  "metadataset": "event.json",
  "metadataset_uri": "http://w3id.org/openeduhub/vocabs/contentTypes/event",
  "language": "de",
  "exportedAt": "2026-11-14T15:26:00.000Z",
  "metadata": {
    "cclom:title": "Workshop",
    "cclom:general_description": null,
    "schema:location": [{ "@type": "VirtualLocation", "name": "Online-Raum", "url": "https://example.org" }]
  },
  "_origins": { "cclom:title": "ai", "schema:location": "user" },
  "_source_text": "…",
  "preview_image_url": "data:image/png;base64,…"
}
```

- `schemaVersion` ist die Version, aus der der Agent das Formular gebaut hat.
  Ohne Inhaltstyp ist `metadataset` `core.json` und `metadataset_uri` `null`.
- `metadata` wird aus dem Formular gebaut: die Felder von Basisschema und
  gewähltem Typ, dazu Schlüssel eines Imports, die kein Feld zeigt. Der Upload
  sendet nur die Felder der Schemata.
- **Eine Regel für leere Werte.** Ein Feld ohne Wert steht nicht im Datensatz –
  kein `""`, `[]` oder `{}` und keine leeren Vorgaben des Agenten. Ein Feld, das
  die Redaktion geleert hat, ist `null`, damit der Host erfährt, dass der Wert
  weg ist. Listen und Objekte, die nur leere Werte enthalten, gelten als leer.
- Objekte behalten ihr `@type` und jeden Schlüssel, den sie beim Import hatten,
  auch ohne Unterfeld. Ein neu ausgefülltes Objekt bekommt das `@type` seiner
  Variante. Ja/Nein-Felder sind `true` / `false`.
- `contentType`, `schemaFile` und die Schlüssel um die Felder herum
  (`processing`, `preview_image_url`, …) eines importierten Datensatzes werden
  nie zu Feldern.
- `_origins` nennt die Herkunft jedes Werts: `"ai"` oder `"user"`, für Felder
  und für die Eingaben von Objektfeldern. Es steht nur auf oberster Ebene, wie
  `_source_text` (der Quelltext, falls vorhanden). Beim erneuten Import stellt
  `_origins` die Herkunft wieder her; ohne es gelten alle importierten Werte als
  KI-Werte.
- Ein Datensatz eines anderen Schema-Kontexts oder einer anderen Version wird
  trotzdem importiert; ein Hinweis sagt es.

**`uploadResult.error`** ist ein lesbarer Text in der Sprache des Widgets. Bei
einer gescheiterten Anfrage: die Ursache in den Worten des Agenten – oder der
eigene Text des Widgets, wenn der Agent nicht geantwortet hat –, nach einer
Zeitüberschreitung, ob der Node verworfen wurde oder noch existiert, und am Ende
die Anfrage-ID. Bei einem Upload, den der Agent beantwortet, aber abgelehnt hat:
dessen `error`-Text. Nicht parsen.

---

## Upload und erweiterte Metadaten

Der Upload-Button ruft `POST /upload` des Agenten auf, der mit seinen eigenen
Zugangsdaten ins Repository schreibt. Das Widget verlangt die Dublettenprüfung,
den Workflow und die erweiterten Daten (`check_duplicates`, `start_workflow`,
`write_extended_data`). Findet der Agent eine Dublette, fragt das Widget die
Redaktion, ob trotzdem hochgeladen werden soll.

Neben den abgebildeten Feldern schreibt der Agent dann drei weitere:

| Feld | Inhalt |
|---|---|
| `ccm:oeh_extendedType` | URI des Inhaltstyps |
| `ccm:oeh_extendedData` | Die Felder des Datensatzes (Basisschema und Typ) als JSON-Text |
| `ccm:oeh_extendedText` | Der Quelltext vor der Erschließung |

- `extended_text` ist der Quelltext des Formulars: das Getippte, der Text, mit
  dem der Agent eine Erschließung beantwortet hat (`_source_text`), oder der
  eines importierten Datensatzes – nie der Text eines Laufs, der gescheitert ist
  oder abgebrochen wurde. Eine Browser-Erweiterung oder ein Harvester nimmt
  `_source_text` aus `metadataSubmit` bzw. aus der Antwort von `/generate` und
  gibt ihn als `extended_text` an `/upload`.
- Ein Formular, dessen Felder nicht vollständig geladen werden konnten (ein
  Schema ist gescheitert), wird **nicht hochgeladen**: Eine Meldung sagt es, und
  `uploadResult` meldet `{ success: false }`.
- Das Widget nennt kein Repository; wohin geschrieben wird, entscheidet der
  Agent.
- Das Widget wartet 130 s auf einen Upload, 330 s auf eine Erschließung und
  30 s auf ein Schema; dann meldet es den Fehler. Nach einem Upload ohne Antwort
  wird die Redaktion gebeten, vor einem neuen Versuch im Repository
  nachzusehen.

---

## Meldungen an die Redaktion

- **Fortschrittszeile** während einer Erschließung, mit „Extraktion abbrechen“,
  in jedem Layout.
- **Fehlerbanner (rot)**, wenn ein Aufruf des Agenten scheitert, in jedem Layout
  über den Gruppen. Es nennt die Ursache in den Worten des Agenten und die
  Anfrage-ID. Wo der Agent den Fehler nicht selbst beschrieben hat, hat das
  Widget eigene Texte, nie die Adresse des Aufrufs: nicht erreichbar, keine
  Antwort in der Zeit, nicht angemeldet oder nicht berechtigt (401/403), nicht
  gefunden (404, mit Hinweis auf `api-url`), Eingabe zu groß (413), Anfrage als
  ungültig abgelehnt (422), zu viele Anfragen (429), unterwegs abgeschnitten
  (408/504), antwortet nicht (5xx) und „die Antwort ist kein Ergebnis des
  Metadata-Agenten“ für ein 200, das kein JSON ist. Das Banner verschwindet,
  wenn die nächste Erschließung oder der nächste Import beginnt; es lässt sich
  in jedem Layout schließen.
- **Hinweisbanner (gelb)** für Hinweise zu einem brauchbaren Ergebnis
  (`processing.warnings`: ein gekürzter Text, Orte ohne Koordinaten, ein
  geratener Inhaltstyp, ein Teilergebnis) und für einen Datensatz eines anderen
  Schema-Kontexts oder einer anderen Version. Screenreader hören es mit dem Ende
  der Erschließung. Es lässt sich in jedem Layout schließen.
- **Hinweise und Fragen** des Widgets selbst (Ergebnis des Uploads, „wirklich
  zurücksetzen?“, ein abgelehntes `metadata-input`) erscheinen oben im Widget.
- Eine Typ-Wahl, ein Import oder ein Zurücksetzen löst eine laufende
  Erschließung ab, deren Anfrage abgebrochen wird. Wird das letzte Element einer
  Instanz entfernt, wird deren laufende Erschließung ebenfalls abgebrochen.

---

## Mehrere Widgets auf einer Seite

| `instance-id` | Verhalten |
|---|---|
| keine | alle Elemente teilen die Instanz `default` |
| dieselbe ID | gemeinsames Formular |
| verschiedene IDs | getrennte Formulare, Läufe und Ereignisse |

```html
<metadata-agent-canvas instance-id="editor-a" layout="default"></metadata-agent-canvas>
<metadata-agent-canvas instance-id="editor-b" layout="plugin"></metadata-agent-canvas>
```

Elemente, die ein Formular teilen:

- `metadataChange` kommt einmal, vom **primären** Element – dem, das der Instanz
  zuerst beigetreten ist; geht es, übernimmt das nächste. Es meldet auch
  Importe, die ein anderes Element gestartet hat.
- `metadataSubmit`, `uploadResult` und `reloadFromPage` kommen von dem Element,
  dessen Button gedrückt wurde.

**Grenze:** Verbindung, Sprache und `debug` gelten je Seite, nicht je Instanz.
`api-url` und `context-name` (samt geladener Schemata) gelten für alle Elemente;
das zuletzt gesetzte gewinnt. Verschiedene Agenten oder Schema-Kontexte auf
einer Seite werden nicht unterstützt.

---

## Browser-Erweiterung

Die Erweiterung zeigt das Widget in ihrem Panel (`layout="plugin"`), gibt
hinein, was sie von der aktuellen Seite gelesen hat, und bekommt den fertigen
Datensatz zurück.

**Eine Seite hineingeben**

| Attribut / Property | Wirkung |
|---|---|
| `text` / `text` | Setzt den Text in das Textfeld. Startet nichts |
| `url` / `url` | Setzt die Adresse in das URL-Feld. Startet nichts |
| `auto-extract` / `autoExtract` | Startet eine Erschließung mit dem, was in den Feldern steht, im nächsten Tick. Jeder Wert außer `false`, `"false"`, `0`, `"0"` und dem leeren Text startet eine – **bei jedem Setzen**, auch mit demselben Wert noch einmal |
| `force-reset` / `forceReset` | Leert das Formular ohne Rückfrage, dazu die Felder für Text, URL und Node-ID. Bei jedem Setzen. Screenshot-Einstellungen und ein `preview-image` des Hosts bleiben |
| `input-mode` / `inputMode` | `text`, `url` oder `nodeId` – entscheidet, was `auto-extract` nimmt |

Woraus `auto-extract` erschließt: im Modus `url` aus der URL; im Modus `nodeId`
aus der Node-ID, die die Redaktion getippt hat (eine Property dafür gibt es
nicht); sonst aus dem Text – und ohne Text aus der URL. Ohne Quelle geschieht
nichts. Es startet auch während einer laufenden Erschließung, die es ablöst.

```js
el.forceReset = true;            // eine neue Seite: Formular leeren
el.inputMode = 'text';
el.text = pageText;
el.url = location.href;          // Rückfall, wenn die Seite keinen Text hat
el.autoExtract = true;
```

**Dasselbe in einem Schritt:** das DOM-Ereignis `plugin-extract`, am Element
ausgelöst.

```js
el.dispatchEvent(new CustomEvent('plugin-extract', {
  detail: { text: pageText, url: location.href, inputMode: 'text', reset: true },
}));
```

`reset: true` leert zuerst das Formular; `inputMode`, `text` und `url` werden
übernommen, wenn sie angegeben sind; dann startet die Erschließung wie bei
`auto-extract`. Das Element muss registriert und eingehängt sein – vorher hört
niemand zu.

**„Webseite laden“** (`show-page-mode="true"`, Layout `plugin`, im
Eingabebereich): Der Button löst das Ereignis `reloadFromPage` aus (ohne
`detail`) und tut sonst nichts. Die Erweiterung antwortet, indem sie die Seite
neu liest und wie oben hineingibt.

**Den Datensatz bekommen:** `metadataSubmit`, wenn die Redaktion „An Plugin
senden“ drückt (der Speichern-Button des Layouts `plugin`), `metadataChange` bei
jeder Änderung, `uploadResult` nach „Ins Repository hochladen“. `_source_text`
des Datensatzes ist der Text für `extended_text` eines Uploads, den die
Erweiterung selbst macht.

**Das Widget in einer Erweiterung laden:** die Konfiguration `extension` bauen
([Build und Auslieferung](#build-und-auslieferung)) und `api-url` setzen – eine
Seite der Erweiterung hat an ihrer eigenen Herkunft keinen Agenten. Ohne
`api-url` zeigt das Widget seine eingebauten Texte und fragt niemanden nach
anderen.

---

## Eigenständige Seite

`npm start` liefert das Widget als eigene Seite (`src/index.html`). Nur diese
Seite liest Einstellungen aus der URL, zum Beispiel
`?layout=dialog&columns=2&inputMode=url`. `apiUrl` und `dataUrl` werden nur auf
`localhost` gelesen. Vollständige Liste:
[docs/URL-PARAMETERS.de.md](docs/URL-PARAMETERS.de.md).

Aus `src/environments/environment.ts` (im Produktions-Build
`environment.prod.ts`) werden zwei Werte gelesen: `apiUrl`, die Adresse des
Agenten, wenn sonst nichts eine nennt (leer: derselbe Host – auch für das
eingebettete Widget), und `logLevel`. `defaultContext` und `defaultVersion`
stehen nur für einen leeren Kontext bzw. eine leere Version ein, die das Widget
nie weitergibt; `defaultLayout` wird nicht gelesen.

---

## Fehlersuche

| Symptom | Ursache und Abhilfe |
|---|---|
| Der Eingabebereich blitzt beim Start auf | Einstellungen kommen nach dem ersten Zeichnen → [Vor dem ersten Zeichnen konfigurieren](#vor-dem-ersten-zeichnen-konfigurieren) |
| Die Texte sind nicht die dieser Version | Die eingebauten Texte werden von `<agent>/widget/i18n/<lang>.json` überschrieben: `src/static/widget/assets/i18n/` des Agenten ist älter als sein Bundle. Beides mit `build-elements.js` ausliefern |
| Das Widget spricht die falsche Sprache | `language` setzen; sonst entscheiden die gemerkte Wahl, das `lang` der Seite und der Browser |
| Icons erscheinen als Wörter (`expand_more`) | `styles.css` nicht geladen, oder der Ordner `fonts/` daneben fehlt – und die Host-Seite bringt keine eigene Icon-Schrift mit |
| Auf einer HTTPS-Seite lädt nichts | Mixed Content: Auch der Agent muss über HTTPS erreichbar sein. Einen Reverse-Proxy mit TLS davorsetzen |
| Ein neues `context-name` / `schema-version` ändert nichts | Wird beim Laden des Schemas gelesen → [Verbindung und Schema](#verbindung-und-schema) |
| Ein Vorschaubild wird nicht gezeigt | Geladen werden nur `data:image/…`, `https:` und der eigene Host der Seite |
| Das Formular bleibt nach `metadataInput`, wie es war | Der Datensatz muss ein Objekt sein (als Attribut: JSON-Text) – sonst zeigt das Widget eine Meldung – und ein **neues** Objekt: Dasselbe noch einmal wird nicht importiert, und `null` leert nichts |
| Nach einem Tab-Wechsel sind die Eingaben der Redaktion weg | Ein wieder eingehängtes Element kommt mit dem letzten Datensatz des Hosts zurück → [Vor dem ersten Zeichnen konfigurieren](#vor-dem-ersten-zeichnen-konfigurieren) |

`debug="true"` schreibt in die Browser-Konsole, unter anderem die Anfrage nach
den Texten des Agenten, die Agent-Adresse und die Instanz. Vor den anderen
Attributen setzen; eine Zeile wird nur geschrieben, solange es an ist.

```
[canvas-0] apiUrl setter called: "http://localhost:8000"
[i18n] Loading de from http://localhost:8000/widget/i18n/de.json?v=4.0.4
[canvas-0] → bound to instance "shared", isPrimary=true
```

---

## Entwicklung

```bash
npm install
npm start                # http://localhost:4200, eigenständige Seite (antwortet nur für localhost)
npm test                 # Karma/Jasmine, Watch-Modus
npx ng test --watch=false --browsers=ChromeHeadless --code-coverage
npm run lint             # ESLint mit angular-eslint, auch für die Templates
```

Untergrenzen der Abdeckung (`karma.conf.js`): Statements 84 %, Branches 73 %,
Functions 85 %, Lines 86 %. Zu den Specs gehören Barrierefreiheits-Prüfungen mit
axe-core, auch mit abgeschaltetem Stylesheet des Widgets, wie edu-sharing es
einbettet (`src/app/embedding-without-styles.spec.ts`). Die Hilfen der Specs
liegen in `src/app/testing/`.

### Aufbau

```
src/app/
├── canvas-element.ts           das Custom Element: Angular Elements und was ein Host braucht
├── app.component.ts            die eigenständige Seite (URL-Parameter)
├── core/                       Dienste und Logik ohne Oberfläche
│   ├── api.service.ts            Aufrufe des Agenten (generate, upload, Schemata, Screenshot)
│   ├── api-url.ts                wo der Agent ist
│   ├── canvas.service.ts         Zustand eines Formulars (je Instanz)
│   ├── canvas-fields.ts          Felder: gefüllt, zählbar, Gruppierung
│   ├── canvas-feedback.ts        Fehlertext, Prüfung der Antworten, Hinweise
│   ├── canvas-metadata.ts        Lesen eines Datensatzes, der Datensatz für Export und Upload
│   ├── instance-registry.ts      Instanzen und ihr Zustand
│   ├── schema.service.ts         Schemata und Inhaltstypen
│   ├── shape-expander.service.ts Objekte ↔ Unterfelder
│   ├── field-validation.service.ts, date-parsing.ts
│   ├── layout.service.ts         Layout-Name oder Alias → Preset
│   ├── i18n.service.ts           welche Sprache
│   ├── dynamic-translate-loader.ts  eingebaute Texte, die des Agenten darüber
│   └── widget-overlay-container.ts, widget-datepicker-intl.ts
├── components/
│   ├── canvas/                 die Komponente hinter dem Element; übergibt an ein Layout
│   ├── field/                  ein Feld
│   ├── layouts/                sieben Layouts, layout-base.ts
│   ├── shared/                 Eingabebereich, Statusleiste, schwebende Leiste, Fortschritt
│   │                           und Banner, Typ-Menü, Gruppenkopf, Vorschau, Vokabularauswahl,
│   │                           Meldungen, SVG-Icons
│   ├── json-loader/, language-switcher/
├── shared/
│   ├── models/canvas.models.ts
│   └── layouts/                Presets und Aliase
└── testing/                    Hilfen der Specs
src/assets/i18n/                de.json, en.json – in main.js eingebaut und an den Agenten ausgeliefert
```

### Build und Auslieferung

```bash
npm run build                                  # dist/, Dateinamen mit Hash

# bauen und das Bundle in den Agenten legen (Ziel immer angeben)
npm run build:elements -- --target=../metadata-agent-3/src/static/widget
```

Der Produktions-Build scheitert über 1,6 MB für das Start-Bundle und warnt über
1,4 MB (`angular.json`; am 14.11.2026 sind es 1,27 MB, 285 kB als die vier
`.gz`-Dateien, die der Agent ausliefert).

`scripts/build-elements.js` kopiert den Produktions-Build in das
Widget-Verzeichnis des Agenten: Bundles ohne Hash plus `.gz`, `assets/i18n/` für
den Endpunkt `/widget/i18n/` des Agenten, `build.json`, Schriften mit ihren
Lizenztexten, `3rdpartylicenses.txt`, `LICENSE` und `NOTICE`. Bundles, Texte und
`build.json` werden am Ende gemeinsam getauscht. Bevor es etwas schreibt, lehnt
es ab:

- ein `dist/` mit einer JavaScript-Datei, die keines der drei Bundles ist (ein
  nachgeladener Chunk bliebe liegen), oder mit zwei Kandidaten für ein Bundle;
- ein Bundle, das einen Host außerhalb seiner Erlaubt-Liste nennt;
- ein `dist/` ohne `de.json` / `en.json`, oder dessen `main.js` deren Texte
  nicht enthält;
- ein fehlendes Bundle, eine fehlende Schrift oder einen fehlenden Lizenztext;
- einen Ziel-Agenten einer anderen Hauptversion (`pyproject.toml`), außer mit
  `--force`.

`build.json` enthält die Widget-Version, die Build-Zeit und einen SHA-256 je
ausgelieferter Datei und über alle zusammen. Die CI des Agenten rechnet ihn aus
den Dateien in dessen Repository nach (`.gitlab-ci.yml` beschreibt den Befehl).

| Konfiguration | Ausgabe | Hashes | Verwendung |
|---|---|---|---|
| `production` | `dist/` | ja | Eigenständig, statisches Hosting, Auslieferung über den Agenten |
| `extension` | `dist-extension/` | nein | Browser-Erweiterung: `main.js`, `polyfills.js`, `runtime.js`, `styles.css` und `fonts/` in die Erweiterung kopieren |
| `development` | – | – | `ng serve` |

Ein Dockerfile gehört nicht zu diesem Repository: `dist/` lässt sich mit jedem
statischen Webserver ausliefern; üblich ist der Weg über den Agenten.

### Technik

Angular 21 (Standalone Components, Angular Elements), Angular Material 21,
ngx-translate, RxJS, TypeScript 5; ESLint mit angular-eslint. Das Widget bleibt
auf Angular 21, wie edu-sharing.

Änderungen: [CHANGELOG.md](CHANGELOG.md).

---

## Lizenz

Apache-2.0, siehe `LICENSE` und `NOTICE`.
