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
 *
 * Before anything is written it refuses a build that still references an
 * external font CDN, a Vercel host or the PageShot API, or that lacks a bundle
 * or a font.
 *
 * The hashes have to go: `src/main.py` mounts the directory and the demo pages
 * reference `/widget/dist/main.js` by that fixed name. The `.gz` twins are what
 * the FastAPI GZip middleware serves for the large bundles.
 *
 * `examples/` is deliberately NOT copied. The backend carries sixteen demo
 * pages there against the two in this repo — they are maintained on that side.
 *
 * Target directory: --target=<path>, or WIDGET_TARGET, or the default below,
 * which assumes both repositories are checked out next to each other.
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

for (const stale of fs.readdirSync(targetFonts).filter((f) => !FONTS.includes(f))) {
  try {
    fs.rmSync(path.join(targetFonts, stale), { force: true });
    console.log(`  dist/fonts/${stale}  (removed, no longer used)`);
  } catch (err) {
    console.warn(`  dist/fonts/${stale}  could not be removed (${err.code}) — unused, delete it later`);
  }
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
