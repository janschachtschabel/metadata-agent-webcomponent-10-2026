# URL parameters of the standalone page

**English** · [Deutsch](URL-PARAMETERS.de.md)

Applies only to the widget's own standalone page (`index.html` with
`<app-root data-metadata-agent-app>`). Embedded as `<metadata-agent-canvas>`,
the same settings are attributes or properties
([README](../README.md#attributes-and-properties)); the page URL is not read
there.

Source: `src/app/app.component.ts` (`parseQueryParams`). A parameter that is not
given leaves the value of the widget or of the layout as it is.

## Connection and data (local only)

`apiUrl` and `dataUrl` are read **only on `localhost`, `127.0.0.1` and
`[::1]`**. On a deployed page a link could otherwise send every upload and every
record to another server.

| Parameter | Value | Effect |
|---|---|---|
| `apiUrl` | URL | Address of the Metadata Agent (otherwise `window.__ENV.agentUrl`, then the address the scripts were loaded from, then the same origin) |
| `dataUrl` | URL | Load JSON and import it like `metadata-input` |

## Schema

| Parameter | Value | Default |
|---|---|---|
| `context` or `contextName` | Context name, e.g. `default`, `mds_oeh` (`context` wins where both are given) | `default` |
| `version` or `schemaVersion` | Version, e.g. `2.0.0` (`version` wins where both are given) | `latest` |

## Layout and display

| Parameter | Value | Effect |
|---|---|---|
| `layout` | `default`, `plugin`, `dialog`, `detail`, `clean`, `prueftisch`, `prueftisch-org` | Layout; aliases such as `metadatenpruefdialog` (→ `clean`) or `extension` (→ `plugin`) still apply |
| `columns` | `1` to `4` | Number of columns (otherwise the layout's default) |
| `flatGroups` | `true` / `false` | All fields in one group |
| `readonly` | `true` / `false` | Read-only |
| `viewerMode` or `viewer` | `true` / `false` | Old name for `readonly`; `readonly` wins where both are given |
| `borderless` | `true` / `false` | No frame, no shadow |
| `highlightAi` | anything but `false` switches it on | Highlight AI values; **off** without the parameter |
| `inputMode` | `text`, `url`, `nodeId` | Input mode (default `text`) |

## Controls

`true` shows, any other value hides; without the parameter the layout's default
applies.

| Parameter | Element |
|---|---|
| `showStatusBar` | Status bar |
| `controls` | Floating bar |
| `showContentType` | Content-type button |
| `showContentTypeOnly` | Only the content-type button in the floating bar |
| `showSaveButton` | Save |
| `showUploadButton` | Upload to the repository |
| `showJsonLoader` | Load JSON |
| `showLanguageSwitcher` | Language switch |
| `showResetButton` | Reset |

Save, upload and reset exist in the layouts `default`, `plugin` and `dialog`,
the JSON loader in `default` only
([README](../README.md#defaults-per-layout)).

Other attributes of the element (e.g. `show-input-area`, `show-core-fields`,
`show-preview`, `enable-screenshot`, `language`) have no URL parameter.

## What the widget sends to the agent

An extraction calls `POST /generate`: a text with `text`, a URL with
`input_source: "url"`, `source_url` and `extraction_method: "browser"`, a node
ID with `input_source: "node_id"` and `node_id`. The full description is in the
agent's API documentation (`/docs`).

## Examples

```
http://localhost:4200/?layout=clean&showStatusBar=true
http://localhost:4200/?layout=dialog&columns=2&readonly=true
http://localhost:4200/?apiUrl=http://localhost:8000&context=mds_oeh&version=2.0.0&inputMode=url
```
