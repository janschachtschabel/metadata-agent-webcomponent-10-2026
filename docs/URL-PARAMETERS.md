# URL-Parameter der Standalone-Seite

Gilt nur für die eigene Standalone-Seite des Widgets (`index.html` mit
`<app-root data-metadata-agent-app>`). Eingebettet als
`<metadata-agent-canvas>` werden dieselben Einstellungen als Attribute bzw.
Properties gesetzt (README, Abschnitt „Attribute“); die Seiten-URL wird dort
nicht gelesen.

Quelle: `src/app/app.component.ts` (`parseQueryParams`). Nicht angegebene
Parameter lassen den Wert des Widgets bzw. des Layouts unverändert.

## Verbindung und Daten (nur lokal)

`apiUrl` und `dataUrl` werden **nur auf `localhost`, `127.0.0.1` und `[::1]`**
gelesen. Auf einer ausgelieferten Seite könnte ein Link sonst jedes Hochladen
und jeden Datensatz an einen anderen Server schicken.

| Parameter | Wert | Wirkung |
|---|---|---|
| `apiUrl` | URL | Adresse des Metadata-Agents (sonst aus der Umgebung) |
| `dataUrl` | URL | JSON laden und wie `metadata-input` importieren |

## Schema

| Parameter | Wert | Standard |
|---|---|---|
| `context` oder `contextName` | Kontextname, z. B. `default`, `mds_oeh` | `default` |
| `version` oder `schemaVersion` | Version, z. B. `2.0.0` | `latest` |

## Layout und Anzeige

| Parameter | Wert | Wirkung |
|---|---|---|
| `layout` | `default`, `plugin`, `dialog`, `detail`, `clean`, `prueftisch`, `prueftisch-org` | Layout; Aliase wie `metadatenpruefdialog` (→ `clean`) oder `extension` (→ `plugin`) gelten weiter |
| `columns` | `1` bis `4` | Spaltenzahl (sonst Vorgabe des Layouts) |
| `flatGroups` | `true` / `false` | Alle Gruppen eines Schemas zu einer zusammenfassen |
| `readonly` | `true` / `false` | Nur lesen |
| `viewerMode` oder `viewer` | `true` / `false` | Alter Name für `readonly` |
| `borderless` | `true` / `false` | Ohne Rahmen und Schatten |
| `highlightAi` | alles außer `false` schaltet ein | KI-Werte hervorheben; ohne Parameter **aus** |
| `inputMode` | `text`, `url`, `nodeId` | Eingabeart (Standard `text`) |

## Bedienelemente

`true` zeigt, jeder andere Wert verbirgt; ohne Parameter gilt die Vorgabe des Layouts.

| Parameter | Element |
|---|---|
| `showStatusBar` | Statusleiste |
| `controls` | Schwebende Steuerelemente |
| `showContentType` | Inhaltstyp-Auswahl |
| `showContentTypeOnly` | Nur die Inhaltstyp-Auswahl in den Steuerelementen |
| `showSaveButton` | Speichern |
| `showUploadButton` | Hochladen ins Repository |
| `showJsonLoader` | JSON laden |
| `showLanguageSwitcher` | Sprachumschalter |
| `showResetButton` | Zurücksetzen |

Weitere Attribute des Elements (z. B. `show-input-area`, `show-core-fields`,
`show-preview`, `enable-screenshot`) haben keinen URL-Parameter.

## Was das Widget an den Agenten sendet

Die Extraktion ruft `POST /generate` auf: Text mit `text`, eine URL mit
`input_source: "url"`, `source_url` und `extraction_method: "browser"`, eine
Node-ID mit `input_source: "node_id"` und `node_id`. Die vollständige
Beschreibung steht in der API-Dokumentation des Agenten (`/docs`).

## Beispiele

```
http://localhost:4200/?layout=clean&showStatusBar=true
http://localhost:4200/?layout=dialog&columns=2&readonly=true
http://localhost:4200/?apiUrl=http://localhost:8000&context=mds_oeh&version=2.0.0&inputMode=url
```
