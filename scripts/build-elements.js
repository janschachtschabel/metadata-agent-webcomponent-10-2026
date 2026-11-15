#!/usr/bin/env node
/**
 * Deploy step for the web component.
 *
 * `package.json` has referenced `scripts/build-elements.js` since the repo was
 * created, but the file was never committed — `npm run build:elements` failed
 * on the second half, and the bundles in the backend were placed by hand.
 * This reproduces exactly the layout that is deployed today.
 *
 * What it does, after `ng build`:
 *   (the four bundles, the texts and build.json are written under .tmp names
 *   and renamed together at the end)
 *   dist/main.<hash>.js       ->  <target>/dist/main.js       + main.js.gz
 *   dist/polyfills.<hash>.js  ->  <target>/dist/polyfills.js  + .gz
 *   dist/runtime.<hash>.js    ->  <target>/dist/runtime.js    + .gz
 *   dist/styles.<hash>.css    ->  <target>/dist/styles.css    + .gz
 *   dist/assets/i18n/*.json   ->  <target>/assets/i18n/
 *   (stamp of this delivery)  ->  <target>/dist/build.json
 *   dist/fonts/<each font styles.css loads>  ->  <target>/dist/fonts/   (written first)
 *   @fontsource/roboto LICENSE, material-icons LICENSE
 *                             ->  <target>/dist/fonts/OFL.txt, LICENSE-material-icons.txt
 *   dist/3rdpartylicenses.txt, LICENSE, NOTICE  ->  <target>/dist/   (licence texts)
 *
 * Before anything is written it refuses a build
 *   - with a JavaScript file in dist/ that is none of the bundles above, or
 *     with two candidates for one of them: a lazy chunk a later change adds
 *     would be left behind and fail in the browser only (audit 14.11., U-17);
 *   - that names a host outside ALLOWED_HOSTS in a bundle (no font CDN, no
 *     screenshot service, nothing loaded from elsewhere);
 *   - without de.json / en.json in dist/assets/i18n, or whose main bundle does
 *     not contain their texts. The widget shows the built-in texts and merges
 *     the agent's /widget/i18n/<lang>.json over them - the agent's file wins,
 *     so the two travel together;
 *   - that lacks a bundle, a font or a licence text;
 * and a target agent of another major version (its pyproject.toml, three
 * levels above src/static/widget) unless --force.
 *
 * build.json says what was delivered: widget version (package.json), time, a
 * SHA-256 per file and one over all of them (`hash`). The agent's CI recomputes
 * it from the files in its repository - a bundle changed by hand, copied in
 * part or left over from another build does not match (see .gitlab-ci.yml).
 *
 * The hashes have to go: `src/main.py` mounts the directory and the demo pages
 * reference `/widget/dist/main.js` by that fixed name. The `.gz` twins are what
 * the FastAPI GZip middleware serves for the large bundles.
 *
 * `examples/` is deliberately NOT copied. The backend carries sixteen demo
 * pages there against the two in this repo — they are maintained on that side.
 *
 * Target directory: --target=<path> (or --target <path>), or WIDGET_TARGET, or
 * the default below, which assumes both repositories are checked out next to
 * each other. The default is the 2.x agent's directory: the version check
 * keeps a 3.x bundle from overwriting it (pass
 * --target=../metadata-agent-3/src/static/widget). Any other argument stops
 * the script: a misspelt one would silently deploy to the default.
 *
 * If writing the temporary bundles fails (a full disk), they are removed and
 * nothing is replaced. If replacing fails part-way, the script exits non-zero
 * and lists which bundles are from the new build and which from the old one.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.resolve(__dirname, '..', 'dist');
const DEFAULT_TARGET = path.resolve(
  __dirname, '..', '..', 'metadata-agent', 'src', 'static', 'widget'
);


/** main.7e656acc.js -> main.js, styles.aaf9caa6.css -> styles.css */
const BUNDLES = [
  { pattern: /^main\.[a-f0-9]+\.js$/, name: 'main.js' },
  { pattern: /^polyfills\.[a-f0-9]+\.js$/, name: 'polyfills.js' },
  { pattern: /^runtime\.[a-f0-9]+\.js$/, name: 'runtime.js' },
  { pattern: /^styles\.[a-f0-9]+\.css$/, name: 'styles.css' },
];

function fail(message) {
  console.error(`build-elements: ${message}`);
  process.exit(1);
}

/** --target=<path>, --target <path> and --force; anything else is an error. */
function parseArgs(args) {
  const parsed = { target: null, force: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') {
      parsed.force = true;
    } else if (arg === '--target' || arg.startsWith('--target=')) {
      parsed.target = arg === '--target' ? args[(i += 1)] : arg.slice('--target='.length);
      if (!parsed.target) fail('--target needs a path: --target=<path> or --target <path>');
    } else {
      fail(`unknown argument "${arg}" — known: --target=<path>, --target <path>, --force`);
    }
  }
  return parsed;
}

const ARGS = parseArgs(process.argv.slice(2));
const TARGET = path.resolve(ARGS.target || process.env.WIDGET_TARGET || DEFAULT_TARGET);
const FORCE = ARGS.force;

if (!fs.existsSync(DIST)) {
  fail(`no dist/ — run "ng build --configuration production" first (${DIST})`);
}
if (!fs.existsSync(TARGET)) {
  fail(`target does not exist: ${TARGET}\n  pass --target=<path> or set WIDGET_TARGET`);
}
console.log(`build-elements: target ${TARGET}`);

// The agent the target belongs to: <agent>/src/static/widget. A bundle of
// another major version would break it (the default target is the 2.x agent).
// Only an agent's widget directory is checked; any other target (the CI's
// elements-check/) has no agent to break.
const widgetVersion = require(path.resolve(__dirname, '..', 'package.json')).version;
const isAgentWidgetDir = TARGET.split(path.sep).slice(-3).join('/') === 'src/static/widget';
const agentPyproject = path.resolve(TARGET, '..', '..', '..', 'pyproject.toml');

/** The `version` of the [project] table, not of whichever table comes first. */
function projectVersion(toml) {
  const table = toml.split(/^\s*\[/m).find((t) => /^project\]/.test(t));
  return table && (table.match(/^\s*version\s*=\s*"([^"]+)"/m) || [])[1];
}

if (!isAgentWidgetDir) {
  console.log("build-elements: target is not an agent's src/static/widget — version not checked");
} else if (fs.existsSync(agentPyproject)) {
  const agentVersion = projectVersion(fs.readFileSync(agentPyproject, 'utf8'));
  const major = (v) => String(v).split('.')[0];
  if (!agentVersion) {
    console.warn(`build-elements: no [project] version in ${agentPyproject} — not checked`);
  } else if (major(agentVersion) !== major(widgetVersion) && !FORCE) {
    fail(`target agent is ${agentVersion}, this widget ${widgetVersion} (${agentPyproject})\n` +
      '  pass --target=<the agent of the same major version>, or --force');
  } else {
    console.log(`build-elements: widget ${widgetVersion} -> agent ${agentVersion}${FORCE ? ' (--force)' : ''}`);
  }
} else {
  console.log(`build-elements: no agent pyproject.toml above the target — version not checked`);
}

const distFiles = fs.readdirSync(DIST);
const targetDist = path.join(TARGET, 'dist');

/** Every file below `dir`, as paths relative to it with forward slashes. */
function filesBelow(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix + entry.name;
    return entry.isDirectory() ? filesBelow(path.join(dir, entry.name), `${relativePath}/`) : [relativePath];
  });
}

const sources = BUNDLES.map((bundle) => {
  const candidates = distFiles.filter((f) => bundle.pattern.test(f));
  if (!candidates.length) {
    fail(`no build output matching ${bundle.pattern} — did the build succeed?`);
  }
  if (candidates.length > 1) {
    fail(`dist/ holds ${candidates.length} files for ${bundle.name} (${candidates.join(', ')}) — ` +
      'leftovers of another build; delete dist/ and build again');
  }
  return { ...bundle, source: candidates[0] };
});

// Only what is deployed may be JavaScript in dist/: a chunk the build adds
// one day (a lazy import) is loaded by main.js under its hashed name, which
// this script would neither copy nor rename (audit 14.11., U-17).
const deployedScripts = new Set(sources.map((bundle) => bundle.source));
const strayScripts = filesBelow(DIST).filter((f) => /\.m?js$/.test(f) && !deployedScripts.has(f));
if (strayScripts.length) {
  fail(`dist/ holds JavaScript this script does not deploy: ${strayScripts.join(', ')}\n` +
    '  a lazy chunk? Add it to BUNDLES (and to the pages that load the widget), or delete dist/ and build again');
}

// Hosts a bundle may name. An allow-list: a deny-list only knows the hosts
// that were a problem before (audit 14.11., U-17). None of these is requested
// by the widget - they are names and links inside the code.
const ALLOWED_HOSTS = [
  'www.w3.org',   // XML namespaces (SVG, XHTML, XLink, MathML)
  'angular.dev',  // links in Angular's error messages
  'example.com',  // placeholder of the URL input
];
const URL_IN_CODE = /(?:https?:)?\/\/((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?![a-z0-9.-])/gi;
for (const file of distFiles.filter((f) => /\.(js|css)$/.test(f))) {
  const content = fs.readFileSync(path.join(DIST, file), 'utf8');
  const foreign = new Set();
  for (const match of content.matchAll(URL_IN_CODE)) {
    // "//name.ext" without a scheme is a URL only where one can stand: after a
    // quote, "(" or "=". Elsewhere it is code (`/[\\/]/i.test(...)`).
    const schemeless = !/^https?:/i.test(match[0]);
    if (schemeless && !/["'`(=]\s*$/.test(content.slice(Math.max(0, match.index - 3), match.index))) continue;
    const host = match[1].toLowerCase();
    if (!ALLOWED_HOSTS.includes(host)) foreign.add(host);
  }
  if (foreign.size) {
    fail(`dist/${file} names ${[...foreign].join(', ')} — only ${ALLOWED_HOSTS.join(', ')} may appear in a bundle.\n` +
      '  Nothing may be loaded from another host; a name that is only text goes on ALLOWED_HOSTS with its reason');
  }
}

// The texts: built into main.js, and delivered as files for the agent's
// /widget/i18n/<lang>.json, which the widget merges over the built-in ones.
// Both from the same build - the agent's file wins, and an older one would
// bring back the texts of the previous release.
const I18N_SOURCE = path.join(DIST, 'assets', 'i18n');
const REQUIRED_LANGUAGES = ['de', 'en']; // WIDGET_LANGUAGES of the agent's widget router
const missingTexts = REQUIRED_LANGUAGES.filter((lang) => !fs.existsSync(path.join(I18N_SOURCE, `${lang}.json`)));
if (missingTexts.length) {
  fail(`missing in dist/assets/i18n: ${missingTexts.map((lang) => `${lang}.json`).join(', ')} — the agent serves them at /widget/i18n/`);
}
const I18N_FILES = fs.readdirSync(I18N_SOURCE).filter((f) => f.endsWith('.json')).sort();

/** The texts of a translation file (the values of its leaves). */
function texts(tree) {
  return Object.values(tree).flatMap((value) => (value && typeof value === 'object' ? texts(value) : [String(value)]));
}
const mainBundle = fs.readFileSync(path.join(DIST, sources.find((b) => b.name === 'main.js').source), 'utf8');
for (const lang of REQUIRED_LANGUAGES) {
  // Compared are the texts a minifier leaves as written: printable ASCII
  // without quotes and backslashes (umlauts may be escaped in the bundle).
  let tree;
  try {
    tree = JSON.parse(fs.readFileSync(path.join(I18N_SOURCE, `${lang}.json`), 'utf8'));
  } catch (err) {
    fail(`dist/assets/i18n/${lang}.json is not JSON (${err.message}) — the agent would answer /widget/i18n/${lang}.json with an error`);
  }
  const plain = texts(tree)
    .filter((text) => text.length >= 8 && /^[\x20-\x7e]+$/.test(text) && !/["'`\\]/.test(text));
  const absent = plain.filter((text) => !mainBundle.includes(text));
  if (!plain.length || absent.length) {
    fail(`main.js does not contain the texts of ${lang}.json (${absent.length} of ${plain.length} compared are missing, ` +
      `e.g. "${absent[0] || ''}") — dist/ is not a build of these sources; build again`);
  }
}

// The fonts are exactly what the built stylesheet loads — url(fonts/<file>) —
// so this list cannot drift from src/styles/main.scss or angular.json.
const FONT_DIR = path.join(DIST, 'fonts');
const stylesheet = sources.find((b) => b.name === 'styles.css').source;
const css = fs.readFileSync(path.join(DIST, stylesheet), 'utf8');
const FONTS = [...new Set([...css.matchAll(/url\(\s*['"]?fonts\/([^'")?#\s]+)/g)].map((m) => m[1]))];
if (!FONTS.length) {
  fail(`dist/${stylesheet} loads no font from fonts/ — icon names would render as text`);
}
const missingFonts = FONTS.filter((f) => !fs.existsSync(path.join(FONT_DIR, f)));
if (missingFonts.length) {
  fail(`missing in dist/fonts: ${missingFonts.join(', ')} — run "npm ci" and rebuild`);
}

// Licence texts travel with the bundle into the image (audit DEP-04): those of
// the bundled packages (Angular writes them on a production build), the
// widget's own LICENSE/NOTICE, and the font licences next to the fonts - the
// OFL (§2) wants its text with every copy of Roboto, Apache-2.0 (§4) its text
// with Material Icons. Checked here, so a missing one stops before any write.
const LICENCES = [
  [path.join(DIST, '3rdpartylicenses.txt'), path.join(targetDist, '3rdpartylicenses.txt')],
  [path.resolve(__dirname, '..', 'LICENSE'), path.join(targetDist, 'LICENSE')],
  [path.resolve(__dirname, '..', 'NOTICE'), path.join(targetDist, 'NOTICE')],
];
const NODE_MODULES = path.resolve(__dirname, '..', 'node_modules');
if (FONTS.some((f) => f.startsWith('roboto-'))) {
  LICENCES.push([path.join(NODE_MODULES, '@fontsource', 'roboto', 'LICENSE'), path.join(targetDist, 'fonts', 'OFL.txt')]);
}
if (FONTS.some((f) => f.startsWith('material-icons'))) {
  LICENCES.push([path.join(NODE_MODULES, 'material-icons', 'LICENSE'), path.join(targetDist, 'fonts', 'LICENSE-material-icons.txt')]);
}
const missingLicences = LICENCES.filter(([from]) => !fs.existsSync(from)).map(([from]) => from);
if (missingLicences.length) {
  fail(`missing licence text: ${missingLicences.join(', ')} — run "npm ci" and a production build`);
}

let written = 0;
const relative = (file) => path.relative(TARGET, file).split(path.sep).join('/');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
/** SHA-256 of every delivered file, by its path below the target (for build.json). */
const delivered = {};

/** Writes a file in place and notes it for build.json. */
function writeInPlace(from, to) {
  const data = fs.readFileSync(from);
  fs.writeFileSync(to, data);
  delivered[relative(to)] = sha256(data);
  written += 1;
  console.log(`  ${relative(to)}`);
}

// Fonts and licence texts first, overwritten in place: deleting a file a
// running server holds open fails on Windows (EBUSY), and failing here leaves
// the deployed bundles as they were. Fonts the new stylesheet no longer loads
// are removed only once it is written — until then the deployed one may still
// need them.
const targetFonts = path.join(targetDist, 'fonts');
fs.mkdirSync(targetFonts, { recursive: true });
for (const file of FONTS) {
  writeInPlace(path.join(FONT_DIR, file), path.join(targetFonts, file));
}
for (const [from, to] of LICENCES) {
  writeInPlace(from, to);
}

// The bundles, the texts and build.json go to temporary names first and are
// renamed only once all of them are written: the directory is served, and a
// page loading meanwhile got a new main.js with the old runtime.js (they must
// come from one build) - or new bundles with the texts of the old ones, which
// the agent's file overrides (audit 14.11., U-17).
const staged = [];

/** Removes the .tmp files that are left; one that cannot go is named. */
function removeStaged() {
  for (const final of staged) {
    try {
      fs.rmSync(`${final}.tmp`, { force: true });
    } catch (err) {
      console.error(`  ${relative(final)}.tmp  could not be removed (${err.code}) — delete it by hand`);
    }
  }
}

function stage(final, data) {
  staged.push(final); // before the write: a half-written .tmp is removed as well
  fs.writeFileSync(`${final}.tmp`, data);
  delivered[relative(final)] = sha256(data);
}

const i18nTarget = path.join(TARGET, 'assets', 'i18n');
const buildStamp = path.join(targetDist, 'build.json');
try {
  for (const bundle of sources) {
    const content = fs.readFileSync(path.join(DIST, bundle.source));
    stage(path.join(targetDist, bundle.name), content);
    stage(path.join(targetDist, `${bundle.name}.gz`), zlib.gzipSync(content, { level: zlib.constants.Z_BEST_COMPRESSION }));
    const kb = (content.length / 1024).toFixed(0);
    console.log(`  ${bundle.source}  ->  dist/${bundle.name}  (${kb} kB, + .gz)`);
  }
  fs.mkdirSync(i18nTarget, { recursive: true });
  for (const file of I18N_FILES) {
    stage(path.join(i18nTarget, file), fs.readFileSync(path.join(I18N_SOURCE, file)));
    console.log(`  assets/i18n/${file}`);
  }

  // The stamp, last: everything above is in `delivered`. `hash` is the SHA-256
  // of the lines "<sha256>  <path>\n" in the order of the paths (the format of
  // sha256sum), so it can be recomputed from the delivered files alone.
  const files = Object.fromEntries(Object.entries(delivered).sort(([a], [b]) => (a < b ? -1 : 1)));
  const hash = sha256(Object.entries(files).map(([file, sum]) => `${sum}  ${file}\n`).join(''));
  const builtAt = fs.statSync(path.join(DIST, sources.find((b) => b.name === 'main.js').source)).mtime.toISOString();
  const stamp = { name: 'metadata-agent-canvas', version: widgetVersion, builtAt, hash, files };
  staged.push(buildStamp);
  fs.writeFileSync(`${buildStamp}.tmp`, `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`  dist/build.json  (widget ${widgetVersion}, built ${builtAt}, hash ${hash.slice(0, 12)}…)`);
} catch (err) {
  removeStaged();
  fail(`writing the new bundles failed (${err.code || err.message}) — nothing replaced, the deployed bundles and texts are unchanged`);
}

const replaced = [];
for (const final of staged) {
  try {
    try {
      fs.renameSync(`${final}.tmp`, final);
    } catch {
      // Windows refuses to replace a file the server holds open (EPERM/EBUSY):
      // copy over it instead, as before.
      fs.copyFileSync(`${final}.tmp`, final);
      fs.rmSync(`${final}.tmp`, { force: true });
    }
  } catch (err) {
    removeStaged();
    const rest = staged.slice(replaced.length + 1).map(relative);
    fail(`replacing the bundles failed at ${relative(final)} (${err.code || err.message}).
` +
      `  THE DEPLOYED BUNDLES ARE MIXED — fix the cause and run again.
` +
      `  new build:     ${replaced.map(relative).join(', ') || 'none'}
` +
      `  possibly half-written: ${relative(final)}
` +
      `  old build:     ${rest.join(', ') || 'none'}`);
  }
  replaced.push(final);
  written += 1;
}

const fontLicences = LICENCES.map(([, to]) => to).filter((to) => path.dirname(to) === targetFonts).map((to) => path.basename(to));
for (const stale of fs.readdirSync(targetFonts).filter((f) => !FONTS.includes(f) && !fontLicences.includes(f))) {
  try {
    fs.rmSync(path.join(targetFonts, stale), { force: true });
    console.log(`  dist/fonts/${stale}  (removed, no longer used)`);
  } catch (err) {
    console.warn(`  dist/fonts/${stale}  could not be removed (${err.code}) — unused, delete it later`);
  }
}

console.log(`\nbuild-elements: ${written} files written to ${TARGET}`);
