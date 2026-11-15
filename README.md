# Metadata Agent Canvas

**English** · [Deutsch](README.de.md)

`<metadata-agent-canvas>` is a web component (Angular 21, Angular Elements) that
shows and edits metadata records. It is the user interface of the
**Metadata Agent API**: every AI step – extraction, normalization, content-type
detection, geocoding, upload to the repository – runs in the agent. The
component renders the form, validates input and reports the record to the
embedding page.

```
embedding page                         Metadata Agent API (FastAPI)
┌──────────────────────────┐   HTTP   ┌──────────────────────────────┐
│ <metadata-agent-canvas>  │ ───────► │ schemas, /generate, /upload, │
│ form, layouts, texts     │          │ /screenshot, texts, bundles  │
└──────────────────────────┘          └──────────────────────────────┘
```

## Contents

1. [Quick start](#quick-start)
2. [Embedding](#embedding)
   - [Files to load](#files-to-load)
   - [Which agent the widget talks to](#which-agent-the-widget-talks-to)
   - [Configure before the first render](#configure-before-the-first-render)
   - [Embedding in edu-sharing](#embedding-in-edu-sharing)
   - [Access from JavaScript](#access-from-javascript)
3. [Attributes and properties](#attributes-and-properties)
4. [Layouts](#layouts)
5. [UI elements](#ui-elements)
6. [Events and the record](#events-and-the-record)
7. [Upload and extended metadata](#upload-and-extended-metadata)
8. [Messages to the editor](#messages-to-the-editor)
9. [Several widgets on one page](#several-widgets-on-one-page)
10. [Browser extension](#browser-extension)
11. [Standalone page](#standalone-page)
12. [Troubleshooting](#troubleshooting)
13. [Development](#development)
14. [License](#license)

---

## Quick start

The agent serves the widget itself. A page needs the stylesheet, three scripts
and the element:

```html
<link rel="stylesheet" href="https://AGENT/widget/dist/styles.css">
<script src="https://AGENT/widget/dist/runtime.js" defer></script>
<script src="https://AGENT/widget/dist/polyfills.js" defer></script>
<script src="https://AGENT/widget/dist/main.js" defer></script>

<metadata-agent-canvas layout="default"></metadata-agent-canvas>
```

`AGENT` is the address under which the page reaches the agent – directly or
through a proxy (for the B-API: `…/api/v1/proxy/metadata-agent-canvas`).
The agent ships demo pages under `/widget/examples/`.

---

## Embedding

### Files to load

| File | Purpose |
|---|---|
| `widget/dist/runtime.js`, `polyfills.js`, `main.js` | The component, with its texts (German, English). Load all three, in this order |
| `widget/dist/styles.css` | Theme, fonts and icons of the widget |
| `widget/dist/fonts/` | Roboto (300/400/500) and Material Icons, loaded by `styles.css` |
| `widget/dist/build.json` | What was delivered: widget version, build time, a hash per file. Not loaded by the widget |

No font or script comes from an external host.

**The stylesheet stays with the widget.** Fonts are registered under names of
their own (`Metadata Agent Roboto`, `Metadata Agent Material Icons`). Theme,
font, icon classes, `--md-*` variables, scrollbars and the focus ring apply only
inside `<metadata-agent-canvas>` and its own overlay container (class
`metadata-agent-overlays`: menus, the calendar, the list of times). A host page
that uses Angular Material itself keeps its `--mat-*` tokens, its font and its
icons; `html` and `body` are not touched. Only Material's helper classes
`.mat-elevation-z*` and `.mat-app-background` are global – the same rules a
Material host brings along.

**Without `styles.css`** (edu-sharing loads only the three scripts) the font,
the icon font and the Material theme of the host page apply. What the widget
brings along in `main.js` regardless:

- four symbols that edu-sharing's icon font (Material Symbols) may lack, as
  inline SVG: the remove symbol of the chips, `info_outline`, `error_outline`
  and `help_outline`. All other icons are decoration on controls that have a
  name of their own;
- the focus ring of its buttons and links, and the frame of the focused input;
- the read-only presentation, the banners and the layout of the form.

The widget's overlays (type menu, calendar, list of times, vocabulary dialog)
sit under `<body>` and take their look from the host's theme alone.

Icons of the host page itself need the host's own icon styles; the agent's demo
pages load `examples/demo-icons.css` for that.

### Which agent the widget talks to

The first that is set:

1. the attribute `api-url` / the property `apiUrl`;
2. `window.__ENV.agentUrl`, set before the scripts run;
3. the address the bundle was loaded from – everything before `/widget/dist/`,
   including a proxy prefix;
4. same-origin paths.

Loaded from the agent, the widget therefore needs no address at all. Keep the
path `/widget/dist/` and the file names; who changes them sets `api-url`.

```html
<!-- optional: a proxy base, before the scripts -->
<script>window.__ENV = { agentUrl: '/api/v1/proxy/metadata-agent-canvas' };</script>
```

The address is one per page: the `api-url` set last applies to all widgets.
When `api-url`, `context-name` and `schema-version` take effect is described
under [Connection and schema](#connection-and-schema).

### Configure before the first render

**Symptom:** for a fraction of a second – up to 1–2 s on a busy page – the text
input area of the default layout appears, although the page uses a layout
without it (`clean`, `detail`, a review table).

**Cause:** the widget draws itself as soon as it is in the DOM and registered,
with the settings it has at that moment. Without settings that is the default
layout, with the input area. If the page sets `layout`, `readonly` and so on
later – after an `await`, in a `setTimeout`, after the scripts have loaded – the
default layout is on screen until then. The widget cannot know that settings
are still to come.

**Rule:** the element has its settings before it is attached. Only loading the
scripts may be asynchronous.

Three ways; the first and the third are safe for every setting:

1. **Attributes in the markup.** Also the smallest fix for an existing
   integration: one static attribute decides the first frame, everything else
   may still follow later.

   ```html
   <metadata-agent-canvas layout="clean"></metadata-agent-canvas>
   ```

2. **Property bindings in the host's template.** Angular sets them when the
   element is in the document already – in the same task, so nothing wrong is
   painted, but after the widget has started. (A framework that sets
   properties before it inserts the element is way 3.)

   ```html
   <metadata-agent-canvas context-name="mds_oeh" schema-version="2.0.0"
                          [layout]="viewer ? 'detail' : 'clean'"
                          [metadataInput]="record"
                          (metadataChange)="onChange($event)">
   </metadata-agent-canvas>
   ```

   - `layout`, `readonly`, `metadataInput` and the other display settings bound
     this way end up as bound. The default layout is built first and replaced
     before the browser paints; a `MutationObserver` sees its input area for
     that moment.
   - `context-name` and `schema-version` bound this way come **too late**: the
     schema is loaded with the defaults. Write these – and an `api-url` that
     differs from the origin of the scripts – as static attributes.

3. **Properties in script, before `appendChild` and before any `await`.** This
   works even when the scripts are not loaded yet: properties set on the element
   before the component is registered are taken over at start, before the first
   frame.

   ```js
   const el = document.createElement('metadata-agent-canvas');
   el.layout = 'clean';
   el.showCoreFields = false;
   el.metadataInput = record;
   container.appendChild(el);
   loadWidgetScripts();            // may run later, may be asynchronous
   ```

What does **not** work:

```js
container.appendChild(document.createElement('metadata-agent-canvas'));
await loadWidgetScripts();         // the widget starts here, in the default layout
el.layout = 'clean';               // too late for the first frame
```

The specs of the element (`src/app/canvas-element.spec.ts`) hold this down:
configured before attaching – by properties or by attributes alone – the input
area never enters the DOM; configured 150 ms after attaching, it is there until
the settings arrive.

To check an integration, watch the element from the moment it is created:

```js
new MutationObserver(() => {
  if (el.querySelector('.input-section, .input-area')) console.warn('input area rendered');
}).observe(el, { childList: true, subtree: true });
```

**An element that is taken out of the document and put back** (a tab, a dialog,
a list that is re-ordered):

- moved within the same task, it stays as it is – form, edits and all;
- out for longer (Angular destroys the component 10 ms after the element left
  the document), it starts anew when it comes back, with everything the host
  had set on it: attributes and properties, the record of `metadataInput`
  included. It takes inputs and reports edits as before, also after the second
  and third return;
- it comes back with the **host's last record**, not with what the editor typed
  since – a host that wants to keep edits hands the record of the last
  `metadataChange` back in as a new object;
- `auto-extract` and `force-reset` are not repeated on return.

### Embedding in edu-sharing

edu-sharing loads `runtime.js`, `polyfills.js` and `main.js` itself (without
`styles.css`) and shows the widget in two places:

| Place | Layout | Record |
|---|---|---|
| Form editor, field `ccm:oeh_extendedData` | `clean`; when viewing `detail`, read-only | `ccm:oeh_extendedData` + `contentType` from `ccm:oeh_extendedType` |
| Detail view (`wlo-extended-content-types`) | `detail`, read-only | the same |

As of 10/2026 edu-sharing sets the values only after `await initWebComponent()`,
in the form editor additionally inside a `setTimeout`. Until then the input area
is visible ([see above](#configure-before-the-first-render); 2.1.1 behaved the
same).

**Smallest fix:** a static attribute in both templates. The assignments that
follow later stay as they are.

```html
<!-- form editor -->
<metadata-agent-canvas #canvas layout="clean" show-floating-controls="false"></metadata-agent-canvas>
<!-- detail view -->
<metadata-agent-canvas #canvas layout="detail" show-floating-controls="false"></metadata-agent-canvas>
```

**Complete fix:** configure first, then load the scripts.

Form editor (MDS widget for `ccm:oeh_extendedData`):

```ts
this.show = r;
this.cdr.detectChanges();                  // creates <metadata-agent-canvas>
if (!r) return;

// Configure at once, not after the scripts have loaded.
const el = this.canvas.nativeElement;
const viewer = this.mdsEditorInstance.editorMode === 'viewer';
el.apiUrl = Od.getBaseUrl(this.deskService); // the value initWebComponent returns
el.language = language;                      // 'de' or 'en', edu-sharing's own; the widget's switch is hidden here
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
el.addEventListener('metadataChange', (e) => { /* as before */ });

// Only the scripts remain (does nothing when the widget is registered already).
this.ngZone.runOutsideAngular(() => Od.initWebComponent(this.deskService));
```

Detail view:

```ts
ngAfterViewInit() {
  const el = this.canvas.nativeElement;      // configure first …
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
  n.initWebComponent(this.deskService);      // … then load the scripts
}
```

If the widget is registered already when this code runs (a second node), the
element has started in the default layout within the same task; the layout set
here replaces it before anything is painted (way 2 above).

Notes on these two integrations:

- **`contentType` inside the record** names its type where the record has no
  `metadataset`, `metadataset_uri` or `schemaFile`; it never becomes a field.
  A type inside the record ranks before the element's `content-type`. A record
  that carries `metadataset` – also `core.json` – counts as typed; its
  `contentType` key is then not read. The form editor keeps setting the
  property `contentType` when the content type changes.
- **`language`** – set it from edu-sharing's language. Without it the widget
  takes the remembered choice of its own switch, then the nearest `lang`
  attribute above the element, then the browser's language.
- **Re-attaching** (tabs, dialogs): see
  [above](#configure-before-the-first-render).

**What an integration should expect from the record** (see
[Events and the record](#events-and-the-record)): no `metadataChange` for an
empty form at start, one after each import; after an edit the event comes
before the field's blur handler returns; a field without a value is **not in
the record**, a field the editor emptied is `null`; no empty lists or objects;
objects keep their `@type`; yes/no fields are `true`/`false`. A host that
merges the event's record into its own reads a missing key as "no value".

### Access from JavaScript

```js
const canvas = document.querySelector('metadata-agent-canvas');

// Prefill. Without a type of its own the record takes the content type the
// page has set (content-type / contentType, also when set afterwards).
canvas.metadataInput = { 'cclom:title': 'My title', 'cclom:general_keyword': ['Maths'] };

// Change at runtime
canvas.layout = 'dialog';
canvas.readonly = true;
canvas.inputMode = 'url';
canvas.contentType = 'event.json';
canvas.language = 'en';

// Read back what was set; undefined for what the host never set
canvas.layout;                     // 'dialog'

// Version of the loaded widget
customElements.get('metadata-agent-canvas').widgetVersion;

canvas.addEventListener('metadataChange', (e) => console.log(e.detail));
```

- `metadataInput` and `contentType` are applied in the order they are set.
- A **new object** is a new record. The same object assigned again – also after
  changing it in place – is not imported again.
- `metadataInput = null` clears nothing; `forceReset = true` empties the form.
- Not at runtime: `contextName`, `schemaVersion`
  ([Connection and schema](#connection-and-schema)).

---

## Attributes and properties

Every setting exists as an HTML attribute (`kebab-case`) and as a property
(`camelCase`).

- Booleans as attributes are the texts `"true"` / `"false"`. The bare attribute
  `readonly` means `true`.
- **Not set** – the attribute removed, the property `undefined` or `null` –
  hands the decision back to the layout (`readonly`, `borderless`, `columns`
  and the `show-…` settings of the [matrix](#defaults-per-layout)) or to the
  setting's own default (`flat-groups`, `highlight-ai`, `show-preview`,
  `show-page-mode`, `show-content-type-only`).
- `show-core-fields`, `show-special-fields`, `show-field-actions`,
  `show-preview`, `highlight-ai` and `enable-screenshot` are on for any value
  but `false`.
- Reading a property returns what the host set last.

### Connection and schema

| Attribute | Property | Default | Meaning |
|---|---|---|---|
| `api-url` | `apiUrl` | see [Which agent](#which-agent-the-widget-talks-to) | Address or proxy base of the agent |
| `context-name` | `contextName` | `default` | Schema context |
| `schema-version` | `schemaVersion` | `latest` | Schema version, for the form and for the extraction (`/generate`) |

**Set these before attaching.** The widget loads schema and content types when
the element is attached and registered, with the values in force at that
moment.

- `contextName` and `schemaVersion` set after a successful load have **no
  effect**.
- A later `apiUrl` applies to all following calls (extraction, upload, texts).
  Schema and content types are **not** loaded again – unless the first load had
  failed: then the new address is tried (so do the next import and the next
  extraction), and the error message goes once it worked. If it names the same
  agent as the origin of the scripts – this is how edu-sharing sets it – nothing
  changes.

To switch context or version, remove the element and create a new one. Agent,
context and loaded schemas are shared by all widgets of a page
([Several widgets](#several-widgets-on-one-page)).

### Data

| Attribute | Property | Meaning |
|---|---|---|
| `metadata-input` | `metadataInput` | Record to prefill the form: the widget's own export (`{ metadataset, metadata: {…} }`) or flat, as the agent answers it. As a property an object, as an attribute its JSON text; anything else is refused with a message and leaves the form as it is |
| `content-type` | `contentType` | Content type: schema file name (`event.json`) or the type's URI. `core.json` = base fields only |

### Layout and display

| Attribute | Property | Default | Meaning |
|---|---|---|---|
| `layout` | `layout` | `default` | Layout preset, see [Layouts](#layouts) |
| `language` | `language` | – | `de` or `en`. Wins over the choice the language switch remembered; not remembered itself. Without it: the remembered choice, then the nearest `lang` above the element, then the browser's language, then German. Where the switch is shown, the editor's choice replaces it until the host sets it again. One language for all widgets of a page |
| `readonly` | `readonly` | `false` (`detail`, `prueftisch-org`: `true`) | Values as text, no input, empty fields hidden; the content-type menu is locked |
| `viewer-mode` | `viewerMode` | – | Old name for `readonly` |
| `columns` | `columns` | per layout | 1–4 columns, see [Columns](#columns) |
| `borderless` | `borderless` | per layout | No frame, no shadow |
| `background-color` | `backgroundColor` | – | CSS background color |
| `input-mode` | `inputMode` | `text` | `text`, `url` or `nodeId` |
| `highlight-ai` | `highlightAi` | `false` | Values from the AI in violet until the editor changes them |
| `flat-groups` | `flatGroups` | `false` | All fields in one group, see [UI elements](#ui-elements) |
| `instance-id` | `instanceId` | `default` | See [Several widgets on one page](#several-widgets-on-one-page) |
| `debug` | `debug` | `false` | Log to the browser console; applies to all widgets of the page |

### Visibility of elements

Defaults depend on the layout ([matrix](#defaults-per-layout)).

| Attribute | Property | Element |
|---|---|---|
| `show-input-area` | `showInputArea` | Input area with mode switch (text / URL / node ID) |
| `show-status-bar` | `showStatusBar` | Status bar: content type, field counts, progress. Shown once the form has fields |
| `show-core-fields` | `showCoreFields` | Base fields (title, description, keywords, …) |
| `show-special-fields` | `showSpecialFields` | Fields of the content type |
| `show-floating-controls` | `showFloatingControls` | The floating bar as a whole. `controls` is an old name for it |
| `show-content-type` | `showContentType` | Content-type button in the floating bar |
| `show-content-type-only` | `showContentTypeOnly` | Hides the action buttons and the language switch of the floating bar; the content-type button stays if `show-content-type` shows it |
| `show-upload-button` | `showUploadButton` | Upload to the repository – `default`, `plugin`, `dialog` only |
| `show-save-button` | `showSaveButton` | Save – `default` (JSON download), `plugin`, `dialog` (`metadataSubmit`) only |
| `show-reset-button` | `showResetButton` | Reset in the floating bar – `default`, `plugin`, `dialog` only |
| `show-json-loader` | `showJsonLoader` | Load a JSON file – `default` only |
| `show-language-switcher` | `showLanguageSwitcher` | Language switch (DE/EN) |
| `show-field-actions` | `showFieldActions` | `default` only: schema badge and counter in the group header |
| `show-page-mode` | `showPageMode` | `plugin` only: the button "Webpage" in the input area, see [Browser extension](#browser-extension) |
| `show-preview` | `showPreview` | Preview image above the groups (default `true`) |
| `show-footer` | `showFooter` | No effect – no layout has a footer; accepted for compatibility |

Attributes for an element a layout does not have are accepted and ignored.

### Preview image and screenshot

| Attribute | Property | Default | Meaning |
|---|---|---|---|
| `enable-screenshot` | `enableScreenshot` | `true` | Take a screenshot when extracting from a URL; the editor can switch it in the input area |
| `screenshot-method` | `screenshotMethod` | `playwright` | Sent to the agent, which takes the picture with its own browser. `pageshot` is accepted as a legacy name; other values are ignored |
| `preview-image` | `previewImage` | – | A preview image from the host. Shown are `data:image/…`, `https:` addresses and addresses of the host page's own origin, also relative ones. The same rule applies to `preview_image_url` of an imported record |

With a text instead of a URL, a screenshot follows when the extracted record
contains a URL (`ccm:wwwurl`).

### For a browser extension

`text`, `url`, `auto-extract`, `force-reset` and the DOM event `plugin-extract`
are described under [Browser extension](#browser-extension).

---

## Layouts

| Layout | Use |
|---|---|
| `default` | Standalone, hosted page, bookmarklet – everything visible |
| `plugin` | Browser extension, compact sidebar |
| `dialog` | Editorial dialog, review of a record |
| `detail` | Detail view, preview, print – read-only, 4 columns |
| `clean` | Frameless, minimal, for embedding and review |
| `prueftisch` | Review table of edu-sharing (`columns="2"` for the wide form) |
| `prueftisch-org` | Organizational review table, read-only |

### Defaults per layout

The presets as they are in `src/app/shared/layouts/presets/` – a spec
(`src/app/readme-tables.spec.ts`) generates this table from them and fails when
the two differ.

<!-- layout-matrix:start -->
| Preset key | `default` | `plugin` | `dialog` | `detail` | `clean` | `prueftisch` | `prueftisch-org` |
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

Each key has its attribute (`inputArea` → `show-input-area`,
`contentTypeSelector` → `show-content-type`, `floatingResetButton` →
`show-reset-button`, …), with one exception: `groupCollapse` – whether a group
can be folded from its header – has none, it belongs to the layout.

A `false` can be switched on by its attribute where the layout has the element.
What a layout does **not** have, whatever the attribute says:

| Layout | No effect |
|---|---|
| `default` | `show-page-mode` |
| `plugin` | `show-json-loader`, `show-field-actions` |
| `dialog` | `show-json-loader`, `show-field-actions`, `show-page-mode` |
| `detail`, `clean`, `prueftisch`, `prueftisch-org` | `show-upload-button`, `show-save-button`, `show-reset-button`, `show-json-loader`, `show-field-actions`, `show-page-mode` |

### Columns

`columns` gives the largest number of columns; a narrow widget shows fewer
(a column is at least 300 px wide).

- `default`, `dialog`, `clean`, `prueftisch`, `prueftisch-org`: 2, 3 or 4
  columns of fields inside each group.
- `plugin`: 2 columns; 3 and 4 behave like 1.
- `detail` (4 by default): the columns hold the **groups**, the fields of a
  group stand below each other. With `flat-groups` the fields form the columns.

### Aliases

Other names that select a layout (`MODE_LAYOUT_MAP` in
`src/app/shared/layouts/layout.models.ts`; generated and checked like the
matrix). An alias selects the layout and changes nothing else – `readonly` as a
layout name is the default layout, not a read-only view.

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

An unknown name falls back to `default` without a message.

### Examples

```html
<!-- read-only, any layout -->
<metadata-agent-canvas layout="default" readonly="true"></metadata-agent-canvas>

<!-- dialog with input area and status bar (off by default there) -->
<metadata-agent-canvas layout="dialog" show-input-area="true" show-status-bar="true" input-mode="url"></metadata-agent-canvas>

<!-- browser extension -->
<metadata-agent-canvas layout="plugin" input-mode="url" show-page-mode="true"></metadata-agent-canvas>

<!-- review table with the content type set by the page -->
<metadata-agent-canvas layout="prueftisch" content-type="event.json"></metadata-agent-canvas>

<!-- base fields only, no floating bar -->
<metadata-agent-canvas show-special-fields="false" show-floating-controls="false"></metadata-agent-canvas>
```

---

## UI elements

**Input area** (`show-input-area`): mode switch (text / URL / node ID), a
textarea or a single-line field, the button that starts the extraction
(Ctrl+Enter in the text), reset, and the screenshot switch. `input-mode`
chooses the mode. While an extraction runs the inputs are read-only and keep
the focus.

**Progress line:** while an extraction runs, every layout shows a line with
"Cancel extraction". Cancelling stops the request; the form stays as it is and
no message follows. The content-type menu, the reset and the upload button are
locked for that time.

**Status bar** (`show-status-bar`): content-type menu, badges ("Fields: 3/31",
"Required: 3/4") and a progress bar.

**Floating bar** (`show-floating-controls`): content type, JSON loader, save,
upload, reset – in this order in every layout that has them – and the language
switch, each with its own attribute. Save and upload are disabled while the
form holds nothing. The reset button of the input area belongs to
`show-input-area`.

**Content-type menu:** choosing a type rebuilds the form. Values of fields both
types have stay; values of the other fields come back when the editor switches
back. If the form came from a source (a text, a URL, a node) and nothing is
kept for the new type yet, an extraction for that type starts. With `readonly`
and while an extraction runs the menu is locked (also in the status bar); the
page can still set the type with `content-type`.

**Fields:** vocabularies with autocomplete (open and closed), a dialog with
search for larger or hierarchical vocabularies (200 entries at a time, "Show
more entries"), radio buttons for yes/no and for closed vocabularies of two to
four values, a calendar for dates, a list of times in steps of 15 minutes
next to the time input, chips for lists. The description of a field stands
below it. Objects (places, persons, schedules) are expanded into sub-fields:

```
schema:location
  → name
  → address → street, postal code, city
  → geo → latitude, longitude
```

A list of objects has "Add entry" below its last entry and "Remove entry" at
each entry. Where a field has several variants (`schema:location`: `Place`,
`VirtualLocation`), the form shows the sub-fields of the variant the object's
`@type` names; without `@type`, the one whose sub-fields the object has.

**Read-only** (`readonly`, the layouts `detail` and `prueftisch-org`): values
are text, lists are lists, web addresses are links that open in a new tab.
Fields without a value are not shown.

**Flat groups** (`flat-groups`): the fields of all groups – base schema and
content type – become one group, titled with the content type (without one:
"All fields"). `show-core-fields` and `show-special-fields` still decide which
fields are in it.

**AI values** (`highlight-ai`): values from the agent are violet and carry a
small mark until the editor changes them.

---

## Events and the record

| Event | When | `detail` |
|---|---|---|
| `metadataChange` | The record has changed | the record |
| `metadataSubmit` | The editor pressed save in the `plugin` ("Send to Plugin") or `dialog` ("Save") layout | the record |
| `uploadResult` | After an upload to the repository, also a refused one | `{ success, nodeId?, error?, duplicate?, repositoryUrl? }` |
| `reloadFromPage` | The editor pressed "Webpage" (`plugin` layout, `show-page-mode`) | – |

In the `default` layout save downloads the record as a JSON file
(`metadata-<date>.json`); no `metadataSubmit` comes from there. The other four
layouts have no save button.

**`metadataChange` fires**

- once after each finished import (`metadata-input`, JSON file) – also when the
  record equals the one reported last;
- after an edit of the editor **at once**: when a field hands its value over
  (on leaving it, on choosing a value), the event comes before that handler
  returns;
- after an extraction and for other changes 50 ms later, if the record differs
  from the one reported last (`exportedAt` does not count);
- **not** at start while the form is empty, and not for intermediate steps of an
  import or an extraction. A `content-type` alone on an empty form fires none; a
  reset reports the empty record.

A typed value counts at once: save, upload and JSON download take in what a
field has not handed over yet.

**The record**

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
    "schema:location": [{ "@type": "VirtualLocation", "name": "Online room", "url": "https://example.org" }]
  },
  "_origins": { "cclom:title": "ai", "schema:location": "user" },
  "_source_text": "…",
  "preview_image_url": "data:image/png;base64,…"
}
```

- `schemaVersion` is the version the agent built the form from. Without a
  content type `metadataset` is `core.json` and `metadataset_uri` is `null`.
- `metadata` is built from the form: the fields of the base schema and of the
  chosen type, plus keys of an import that no field shows. The upload sends
  only the fields of the schemas.
- **One rule for empty values.** A field without a value is not in the record –
  no `""`, `[]` or `{}`, and none of the agent's empty defaults. A field the
  editor emptied is `null`, so the host learns that the value is gone. Lists and
  objects that hold nothing but empty values count as empty.
- Objects keep their `@type` and every key they had on import, also keys
  without a sub-field. An object filled in newly gets the `@type` of its
  variant. Yes/no fields are `true` / `false`.
- `contentType`, `schemaFile` and the keys around the fields (`processing`,
  `preview_image_url`, …) of an imported record never become fields.
- `_origins` says where each value comes from: `"ai"` or `"user"`, for fields
  and for the inputs of object fields. It stands only at the top level, like
  `_source_text` (the source text, if any). On re-import `_origins` restores the
  origin; without it all imported values count as AI values.
- A record of another schema context or version is imported all the same; a
  notice says so.

**`uploadResult.error`** is a readable text in the widget's language. For a
request that failed: the cause in the agent's words – or the widget's own text
when the agent did not answer –, after a timeout whether the node was discarded
or still exists, and at the end the request ID. For an upload the agent
answered but refused, the agent's `error` text. Do not parse it.

---

## Upload and extended metadata

The upload button calls `POST /upload` of the agent, which writes to the
repository with its own credentials. The widget asks for a duplicate check, the
workflow and the extended data (`check_duplicates`, `start_workflow`,
`write_extended_data`). If the agent finds a duplicate, the widget asks the
editor whether to upload anyway.

Besides the mapped fields the agent then writes three more:

| Field | Content |
|---|---|
| `ccm:oeh_extendedType` | URI of the content type |
| `ccm:oeh_extendedData` | The record's fields (base schema and type) as JSON text |
| `ccm:oeh_extendedText` | The source text before the extraction |

- `extended_text` is the source text of the form: what was typed, the text the
  agent answered an extraction with (`_source_text`), or that of an imported
  record – never the text of a run that failed or was cancelled. A browser
  extension or a harvester takes `_source_text` from `metadataSubmit` or from
  the answer of `/generate` and passes it to `/upload` as `extended_text`.
- A form whose fields could not be loaded completely (a schema failed) is
  **not uploaded**: a message says so and `uploadResult` reports
  `{ success: false }`.
- The widget names no repository; the agent decides where it writes.
- The widget waits 130 s for an upload, 330 s for an extraction and 30 s for a
  schema; then it reports the failure. After an upload that did not answer, the
  editor is told to check the repository before uploading again.

---

## Messages to the editor

- **Progress line** while an extraction runs, with "Cancel extraction", in
  every layout.
- **Error banner (red)** when a call to the agent fails, in every layout above
  the groups. It names the cause in the agent's words and the request ID. Where
  the agent did not word the failure, the widget has texts of its own, never
  the address of the call: not reachable, no answer in time, not signed in or
  not permitted (401/403), not found (404, with a hint at `api-url`), input too
  large (413), request refused as invalid (422), too many requests (429), cut
  off on the way (408/504), not answering (5xx), and "the answer is not a
  result of the metadata agent" for a 200 that is no JSON. The banner goes when
  the next extraction or import starts; it can be closed in every layout.
- **Notice banner (yellow)** for hints about a usable result
  (`processing.warnings`: a shortened text, places without coordinates, a
  guessed content type, a partial result) and for a record of another schema
  context or version. Screen readers hear it with the end of the extraction. It
  can be closed in every layout.
- **Notices and questions** of the widget itself (upload result, "really
  reset?", a refused `metadata-input`) appear at the top of the widget.
- A type choice, an import or a reset replaces a running extraction, whose
  request is aborted. When the last element of an instance is removed, its
  running extraction is aborted too.

---

## Several widgets on one page

| `instance-id` | Behavior |
|---|---|
| none | all elements share the instance `default` |
| the same ID | shared form |
| different IDs | separate forms, runs and events |

```html
<metadata-agent-canvas instance-id="editor-a" layout="default"></metadata-agent-canvas>
<metadata-agent-canvas instance-id="editor-b" layout="plugin"></metadata-agent-canvas>
```

Elements that share a form:

- `metadataChange` comes once, from the **primary** element – the one that
  joined the instance first; when it goes, the next one takes over. It also
  reports imports another element started.
- `metadataSubmit`, `uploadResult` and `reloadFromPage` come from the element
  whose button was pressed.

**Limit:** connection, language and `debug` are per page, not per instance.
`api-url` and `context-name` (with the loaded schemas) apply to all elements;
the last one set wins. Different agents or schema contexts on one page are not
supported.

---

## Browser extension

The extension shows the widget in its panel (`layout="plugin"`), hands in what
it read from the current page and receives the finished record.

**Handing in a page**

| Attribute / property | Effect |
|---|---|
| `text` / `text` | Puts the text into the text box. Starts nothing |
| `url` / `url` | Puts the address into the URL field. Starts nothing |
| `auto-extract` / `autoExtract` | Starts an extraction with what the boxes hold, on the next tick. Any value but `false`, `"false"`, `0`, `"0"` and the empty text starts one – **every time it is set**, also with the same value again |
| `force-reset` / `forceReset` | Empties the form without asking, and the text, URL and node-ID boxes with it. Every time it is set. Screenshot settings and a `preview-image` of the host stay |
| `input-mode` / `inputMode` | `text`, `url` or `nodeId` – decides what `auto-extract` takes |

What `auto-extract` extracts from: in mode `url` the URL; in mode `nodeId` the
node ID the editor typed (there is no property for it); otherwise the text –
and if there is no text, the URL. With nothing to extract from, nothing
happens. It also starts while another extraction runs, which it replaces.

```js
el.forceReset = true;            // a new page: empty the form
el.inputMode = 'text';
el.text = pageText;
el.url = location.href;          // fallback if the page has no text
el.autoExtract = true;
```

**The same in one step:** the DOM event `plugin-extract`, dispatched on the
element.

```js
el.dispatchEvent(new CustomEvent('plugin-extract', {
  detail: { text: pageText, url: location.href, inputMode: 'text', reset: true },
}));
```

`reset: true` empties the form first; `inputMode`, `text` and `url` are taken
if given; then the extraction starts as with `auto-extract`. The element must
be registered and attached – before that nobody listens.

**"Webpage"** (`show-page-mode="true"`, `plugin` layout, in the input area):
the button fires the event `reloadFromPage` (no detail) and does nothing else.
The extension answers by reading the page again and handing it in as above.

**Receiving the record:** `metadataSubmit` when the editor presses "Send to
Plugin" (the save button of the `plugin` layout), `metadataChange` for every
change, `uploadResult` after "Upload to Repository". `_source_text` of the
record is the text for `extended_text` of an upload the extension does itself.

**Loading the widget in an extension:** build the configuration `extension`
([Build and delivery](#build-and-delivery)) and set `api-url` – an extension
page has no agent at its own origin. Without `api-url` the widget shows its
built-in texts and asks nobody for others.

---

## Standalone page

`npm start` serves the widget as a page of its own (`src/index.html`). Only
this page reads settings from the URL, for example
`?layout=dialog&columns=2&inputMode=url`. `apiUrl` and `dataUrl` are read on
`localhost` only. Full list: [docs/URL-PARAMETERS.md](docs/URL-PARAMETERS.md).

Of `src/environments/environment.ts` (in a production build
`environment.prod.ts`) two values are read: `apiUrl`, the address of the agent
if nothing else names one (empty: same origin – for the embedded widget as
well), and `logLevel`. `defaultContext` and `defaultVersion` only stand in for
an empty context or version, which the widget never hands on; `defaultLayout`
is not read.

---

## Troubleshooting

| Symptom | Cause and remedy |
|---|---|
| The input area flashes at start | Settings arrive after the first render → [Configure before the first render](#configure-before-the-first-render) |
| Texts are not the ones of this version | The built-in texts are overridden by `<agent>/widget/i18n/<lang>.json`: the agent's `src/static/widget/assets/i18n/` is older than its bundle. Deliver both with `build-elements.js` |
| The widget speaks the wrong language | Set `language`; otherwise the remembered choice, the page's `lang` and the browser decide |
| Icons appear as words (`expand_more`) | `styles.css` not loaded, or its `fonts/` folder is missing next to it – and the host page brings no icon font of its own |
| Nothing loads on an HTTPS page | Mixed content: the agent must be reachable over HTTPS too. Put a reverse proxy with TLS in front of it |
| A new `context-name` / `schema-version` changes nothing | Read when the schema is loaded → [Connection and schema](#connection-and-schema) |
| A preview image is not shown | Only `data:image/…`, `https:` and the page's own origin are loaded |
| The form stays as it was after `metadataInput` | The record must be an object (as an attribute: JSON text) – the widget shows a message otherwise – and a **new** object: the same one again is not imported, and `null` clears nothing |
| After a tab change the editor's input is gone | A re-attached element comes back with the host's last record → [Configure before the first render](#configure-before-the-first-render) |

`debug="true"` logs to the browser console, among other things the request for
the agent's texts, the agent address and the instance. Set it before the other
attributes; a line is written only while it is on.

```
[canvas-0] apiUrl setter called: "http://localhost:8000"
[i18n] Loading de from http://localhost:8000/widget/i18n/de.json?v=4.0.0
[canvas-0] → bound to instance "shared", isPrimary=true
```

---

## Development

```bash
npm install
npm start                # http://localhost:4200, standalone page (answers for localhost only)
npm test                 # Karma/Jasmine, watch mode
npx ng test --watch=false --browsers=ChromeHeadless --code-coverage
npm run lint             # ESLint with angular-eslint, templates included
```

Coverage floors (`karma.conf.js`): statements 84 %, branches 73 %, functions
85 %, lines 86 %. The specs include accessibility checks with axe-core, also
with the widget's stylesheet switched off, as edu-sharing embeds it
(`src/app/embedding-without-styles.spec.ts`). The helpers of the specs are in
`src/app/testing/`.

### Structure

```
src/app/
├── canvas-element.ts           the custom element: Angular Elements plus what a host needs
├── app.component.ts            the standalone page (URL parameters)
├── core/                       services and logic without UI
│   ├── api.service.ts            calls to the agent (generate, upload, schemas, screenshot)
│   ├── api-url.ts                where the agent is
│   ├── canvas.service.ts         state of a form (per instance)
│   ├── canvas-fields.ts          fields: filled, countable, grouping
│   ├── canvas-feedback.ts        error text, check of answers, warnings
│   ├── canvas-metadata.ts        reading a record, the record for export and upload
│   ├── instance-registry.ts      instances and their state
│   ├── schema.service.ts         schemas and content types
│   ├── shape-expander.service.ts objects ↔ sub-fields
│   ├── field-validation.service.ts, date-parsing.ts
│   ├── layout.service.ts         layout name or alias → preset
│   ├── i18n.service.ts           which language
│   ├── dynamic-translate-loader.ts  built-in texts, the agent's merged over them
│   └── widget-overlay-container.ts, widget-datepicker-intl.ts
├── components/
│   ├── canvas/                 the component behind the element; hands over to a layout
│   ├── field/                  one field
│   ├── layouts/                seven layouts, layout-base.ts
│   ├── shared/                 input area, status bar, floating bar, progress and banners,
│   │                           content-type menu, group header, preview, vocabulary picker,
│   │                           notices, SVG icons
│   ├── json-loader/, language-switcher/
├── shared/
│   ├── models/canvas.models.ts
│   └── layouts/                presets and aliases
└── testing/                    harnesses of the specs
src/assets/i18n/                de.json, en.json – built into main.js and delivered to the agent
```

### Build and delivery

```bash
npm run build                                  # dist/, hashed file names

# build and place the bundle in the agent (always name the target)
npm run build:elements -- --target=../metadata-agent-3/src/static/widget
```

The production build fails above 1.6 MB for the initial bundle and warns above
1.4 MB (`angular.json`; on 14.11.2026 it is 1.27 MB, 285 kB as the four `.gz`
files the agent serves).

`scripts/build-elements.js` copies the production build into the agent's widget
directory: bundles without hash plus `.gz`, `assets/i18n/` for the agent's
`/widget/i18n/` endpoint, `build.json`, fonts with their license texts,
`3rdpartylicenses.txt`, `LICENSE` and `NOTICE`. Bundles, texts and `build.json`
are swapped together at the end. Before it writes anything it refuses

- a `dist/` with a JavaScript file that is none of the three bundles (a lazy
  chunk would be left behind), or with two candidates for one bundle;
- a bundle that names a host outside its allow-list;
- a `dist/` without `de.json` / `en.json`, or whose `main.js` does not contain
  their texts;
- a missing bundle, font or license text;
- a target agent of another major version (`pyproject.toml`), unless `--force`
  is given.

`build.json` holds the widget version, the build time and a SHA-256 per
delivered file and over all of them. The agent's CI recomputes it from the
files in its repository (`.gitlab-ci.yml` describes the command).

| Configuration | Output | Hashes | Use |
|---|---|---|---|
| `production` | `dist/` | yes | Standalone, static hosting, delivery through the agent |
| `extension` | `dist-extension/` | no | Browser extension: copy `main.js`, `polyfills.js`, `runtime.js`, `styles.css` and `fonts/` into the extension |
| `development` | – | – | `ng serve` |

There is no Dockerfile in this repository: `dist/` can be served by any static
web server; the usual way is through the agent.

### Stack

Angular 21 (standalone components, Angular Elements), Angular Material 21,
ngx-translate, RxJS, TypeScript 5; ESLint with angular-eslint. The widget stays
on Angular 21, like edu-sharing.

Changes: [CHANGELOG.md](CHANGELOG.md) (German).

---

## License

Apache-2.0, see `LICENSE` and `NOTICE`.
