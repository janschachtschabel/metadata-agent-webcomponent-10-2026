// @ts-check
/**
 * ESLint for the widget (audit 14.11., U-19, W-ARCH-02): the recommended rules
 * of ESLint, typescript-eslint and angular-eslint, and for the templates
 * angular-eslint's recommended and accessibility rules.
 *
 * `npm run lint` must end without errors; CI blocks on it. Rules that the code
 * as it is does not meet are set to "warn" or switched off below, each with
 * its reason and its count at the time (14.11.2026) - not rewritten in bulk to
 * please the linter. Turn one on again when its findings are gone.
 */
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/', 'dist-extension/', 'coverage/', 'out-tsc/', '.angular/', 'elements-check/', 'node_modules/'],
  },
  {
    files: ['src/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    // Inline templates (group header, notice, language switcher, ...) get the template rules too.
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'app', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'app', style: 'camelCase' }],
      // `_changes`, `[_, hours, minutes]`: a leading underscore says "not used on purpose".
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
      // warn: 167 uses in the application code (schema values, records and
      // answers of the agent are untyped JSON). Typing them is work of its own
      // (audit U-19); the warning keeps the count in view.
      '@typescript-eslint/no-explicit-any': 'warn',
      // warn: 13 outputs of the layouts and their shared parts are called
      // `reset`, `cancel`, `submit` - internal to the widget, on elements that
      // fire no native event of that name. Renaming touches all seven layouts.
      '@angular-eslint/no-output-native': 'warn',
      // off: 35 constructors take their services as parameters. Moving to
      // inject() is a mechanical migration (`ng generate @angular/core:inject`),
      // not part of a fix round.
      '@angular-eslint/prefer-inject': 'off',
    },
  },
  {
    // Specs and the test harness fake services and reach into answers with
    // `as any` (326 uses); that is what they are for.
    files: ['src/**/*.spec.ts', 'src/app/testing/**/*.ts', 'src/**/*.d.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['src/**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {
      // off: 180 structural directives (*ngIf, *ngFor) in 16 templates. New
      // code uses @if/@for; the rest is a mechanical migration
      // (`ng generate @angular/core:control-flow`) with a diff of its own.
      '@angular-eslint/template/prefer-control-flow': 'off',
    },
  },
  {
    // Node scripts and configuration files.
    files: ['scripts/**/*.js', '*.js'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', __dirname: 'readonly' },
    },
  },
);
