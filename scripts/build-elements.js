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
 *   dist/main.<hash>.js       ->  <target>/dist/main.js       + main.js.gz
 *   dist/polyfills.<hash>.js  ->  <target>/dist/polyfills.js  + .gz
 *   dist/runtime.<hash>.js    ->  <target>/dist/runtime.js    + .gz
 *   dist/styles.<hash>.css    ->  <target>/dist/styles.css    + .gz
 *   dist/assets/i18n/*.json   ->  <target>/assets/i18n/
 *   dist/fonts/<each font styles.css loads>  ->  <target>/dist/fonts/   (written first)
 *   @fontsource/roboto LICENSE, material-icons LICENSE
 *                             ->  <target>/dist/fonts/OFL.txt, LICENSE-material-icons.txt
 *   dist/3rdpartylicenses.txt, LICENSE, NOTICE  ->  <target>/dist/   (licence texts)
 *
 * Before anything is written it refuses a build that still references an
 * external font CDN, a Vercel host or the PageShot API, that lacks a bundle,
 * a font or a licence text, and a target agent of another major version
 * (its pyproject.toml, three levels above src/static/widget) unless --force.
 *
 * The hashes have to go: `src/main.py` mounts the directory and the demo pages
 * reference `/widget/dist/main.js` by that fixed name. The `.gz` twins are what
 * the FastAPI GZip middleware serves for the large bundles.
 *
 * `examples/` is deliberately NOT copied. The backend carries sixteen demo
 * pages there against the two in this repo — they are maintained on that side.
 *
 * Target directory: --target=<path>, or WIDGET_TARGET, or the default below,
 * which assumes both repositories are checked out next to each other. The
 * default is the 2.x agent's directory: the version check keeps a 3.x bundle
 * from overwriting it (pass --target=../metadata-agent-3/src/static/widget).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.resolve(__dirname, '..', 'dist');
const DEFAULT_TARGET = path.resolve(
  __dirname, '..', '..', 'metadata-agent', 'src', 'static', 'widget'
);

const fromArgv = process.argv.find((a) => a.startsWith('--target='));
const TARGET = path.resolve(
  fromArgv ? fromArgv.slice('--target='.length) : process.env.WIDGET_TARGET || DEFAULT_TARGET
);
const FORCE = process.argv.includes('--force');

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

const FORBIDDEN_HOSTS = [/fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i, /vercel\.app/i, /pageshot\.site/i];
for (const file of distFiles.filter((f) => /\.(js|css)$/.test(f))) {
  const content = fs.readFileSync(path.join(DIST, file), 'utf8');
  const hit = FORBIDDEN_HOSTS.find((re) => re.test(content));
  if (hit) {
    fail(`dist/${file} references ${hit} — external hosts must not be shipped`);
  }
}

const sources = BUNDLES.map((bundle) => {
  const source = distFiles.find((f) => bundle.pattern.test(f));
  if (!source) {
    fail(`no build output matching ${bundle.pattern} — did the build succeed?`);
  }
  return { ...bundle, source };
});

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

// Fonts first, overwritten in place: deleting a file a running server holds
// open fails on Windows (EBUSY), and failing here leaves the deployed bundles
// as they were. Fonts the new stylesheet no longer loads are removed only once
// it is written — until then the deployed one may still need them.
const targetFonts = path.join(targetDist, 'fonts');
fs.mkdirSync(targetFonts, { recursive: true });
for (const file of FONTS) {
  fs.copyFileSync(path.join(FONT_DIR, file), path.join(targetFonts, file));
  written += 1;
  console.log(`  dist/fonts/${file}`);
}

for (const bundle of sources) {
  const source = bundle.source;
  const content = fs.readFileSync(path.join(DIST, source));
  fs.writeFileSync(path.join(targetDist, bundle.name), content);
  fs.writeFileSync(
    path.join(targetDist, `${bundle.name}.gz`),
    zlib.gzipSync(content, { level: zlib.constants.Z_BEST_COMPRESSION })
  );
  written += 2;
  const kb = (content.length / 1024).toFixed(0);
  console.log(`  ${source}  ->  dist/${bundle.name}  (${kb} kB, + .gz)`);
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

for (const [from, to] of LICENCES) {
  fs.copyFileSync(from, to);
  written += 1;
  console.log(`  ${path.relative(TARGET, to).split(path.sep).join('/')}`);
}

const i18nSource = path.join(DIST, 'assets', 'i18n');
if (fs.existsSync(i18nSource)) {
  const i18nTarget = path.join(TARGET, 'assets', 'i18n');
  fs.mkdirSync(i18nTarget, { recursive: true });
  for (const file of fs.readdirSync(i18nSource).filter((f) => f.endsWith('.json'))) {
    fs.copyFileSync(path.join(i18nSource, file), path.join(i18nTarget, file));
    written += 1;
    console.log(`  assets/i18n/${file}`);
  }
}

console.log(`\nbuild-elements: ${written} files written to ${TARGET}`);
