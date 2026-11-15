/**
 * Audit 14.11. (U-07): an icon is the name of a ligature in the icon font. A
 * name the font does not know shows as text - "captive_portal" on the button
 * that loads the current web page was one: the shipped font (Material Icons)
 * has no such ligature. And edu-sharing brings its own icon font, which may
 * lack the outlined names; those are drawn as SVG.
 *
 * Every icon name written in a template is checked against the list of the
 * shipped font (node_modules/material-icons/css/_codepoints.scss, served to
 * the specs as /fonts/_codepoints.scss). Names that come from the schema at
 * run time (the icon of a group or of a content type) are not covered.
 */
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import canvas from './components/canvas/canvas.component.html?ngResource';
import field from './components/field/field.component.html?ngResource';
import cleanLayout from './components/layouts/clean-layout/clean-layout.component.html?ngResource';
import defaultLayout from './components/layouts/default-layout/default-layout.component.html?ngResource';
import detailLayout from './components/layouts/detail-layout/detail-layout.component.html?ngResource';
import dialogLayout from './components/layouts/dialog-layout/dialog-layout.component.html?ngResource';
import pluginLayout from './components/layouts/plugin-layout/plugin-layout.component.html?ngResource';
import prueftischLayout from './components/layouts/prueftisch-layout/prueftisch-layout.component.html?ngResource';
import prueftischOrgLayout from './components/layouts/prueftisch-org-layout/prueftisch-org-layout.component.html?ngResource';
import contentTypeMenu from './components/shared/content-type-menu/content-type-menu.component.html?ngResource';
import extractionFeedback from './components/shared/extraction-feedback/extraction-feedback.component.html?ngResource';
import floatingBar from './components/shared/floating-bar/floating-bar.component.html?ngResource';
import inputArea from './components/shared/input-area/input-area.component.html?ngResource';
import previewThumbnail from './components/shared/preview-thumbnail/preview-thumbnail.component.html?ngResource';
import statusBar from './components/shared/status-bar/status-bar.component.html?ngResource';
import vocabTreePicker from './components/shared/vocab-tree-picker/vocab-tree-picker.component.html?ngResource';

import { JsonLoaderComponent } from './components/json-loader/json-loader.component';
import { LanguageSwitcherComponent } from './components/language-switcher/language-switcher.component';
import { GroupHeaderComponent } from './components/shared/group-header/group-header.component';
import { WidgetNoticeComponent } from './components/shared/widget-notice/widget-notice.component';
import { FloatingBarComponent } from './components/shared/floating-bar/floating-bar.component';

const TEMPLATES: Record<string, string> = {
  canvas, field, cleanLayout, defaultLayout, detailLayout, dialogLayout, pluginLayout, prueftischLayout,
  prueftischOrgLayout, contentTypeMenu, extractionFeedback, floatingBar, inputArea, previewThumbnail,
  statusBar, vocabTreePicker,
};

/** Names edu-sharing's icon font is known or feared to lack: these must be SVG (app-svg-icon). */
const SVG_ONLY = ['cancel', 'info_outline', 'error_outline', 'help_outline'];

/** What a <mat-icon> of a template names: its text, or the string literals of its expression. */
function iconNames(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(/<mat-icon\b[^>]*>([^<]*)<\/mat-icon>/g)) {
    const content = match[1].trim();
    if (!content) continue; // filled with an SVG or projected content
    if (content.startsWith('{{')) names.push(...Array.from(content.matchAll(/'([a-z0-9_]+)'/g), literal => literal[1]));
    else names.push(content);
  }
  return names;
}

async function shippedIcons(): Promise<Set<string>> {
  const response = await fetch('/fonts/_codepoints.scss');
  expect(response.ok).withContext('the codepoints of the shipped icon font are served to the specs').toBeTrue();
  const scss = await response.text();
  return new Set(Array.from(scss.matchAll(/^\s*"([a-z0-9_]+)":/gm), match => match[1]));
}

describe('icon names', () => {
  it('finds the names in a template (the check itself)', () => {
    expect(iconNames(`<mat-icon>save</mat-icon><mat-icon class="x" aria-hidden="true">
      close </mat-icon><mat-icon>{{ open ? 'expand_less' : 'expand_more' }}</mat-icon>
      <mat-icon><app-svg-icon name="cancel"></app-svg-icon></mat-icon><mat-icon>{{ saveIcon }}</mat-icon>`))
      .toEqual(['save', 'close', 'expand_less', 'expand_more']);
  });

  it('in the templates are all ligatures of the shipped icon font', async () => {
    const shipped = await shippedIcons();
    expect(shipped.size).withContext('codepoints parsed').toBeGreaterThan(2000);
    expect(shipped.has('captive_portal')).withContext('the name the audit found').toBeFalse();

    const unknown = Object.entries(TEMPLATES).flatMap(([template, text]) =>
      iconNames(text).filter(name => !shipped.has(name)).map(name => `${name} (${template})`));
    const used = Object.values(TEMPLATES).flatMap(iconNames);

    expect(used.length).withContext('icons found in the templates').toBeGreaterThan(30);
    expect(unknown).toEqual([]);
  });

  it('that edu-sharing may lack are not written as ligatures', () => {
    const asLigature = Object.entries(TEMPLATES).flatMap(([template, text]) =>
      iconNames(text).filter(name => SVG_ONLY.includes(name)).map(name => `${name} (${template})`));

    expect(asLigature).toEqual([]);
  });

  // The components with a template of their own in the .ts file: as rendered.
  const INLINE: [string, Type<unknown>, Record<string, unknown>[]][] = [
    ['json loader', JsonLoaderComponent, [{}]],
    ['language switcher', LanguageSwitcherComponent, [{}]],
    ['group header', GroupHeaderComponent, [
      { group: { id: 'g', label: 'G', schemaName: 'Core', fields: [] }, collapsible: true },
      { group: { id: 'g', label: 'G', schemaName: 'Core', fields: [], collapsed: true }, collapsible: true },
    ]],
    ['notice', WidgetNoticeComponent, [
      { notice: { text: 'Hinweis', kind: 'info' } },
      { notice: { text: 'Fehler', kind: 'error' } },
      { notice: { text: 'Frage?', kind: 'info', question: true } },
    ]],
    // Its icons come in through inputs of the layouts (saveIcon).
    ['floating bar', FloatingBarComponent, [
      { showSaveButton: true, showUploadButton: true, showResetButton: true, showJsonLoader: true },
      { showSaveButton: true, saveIcon: 'cloud_upload', labelled: true },
    ]],
  ];
  for (const [name, component, states] of INLINE) {
    it(`of the ${name}, as rendered, are ligatures of the shipped font and none of the SVG-only ones`, async () => {
      const shipped = await shippedIcons();
      const rendered: string[] = [];
      for (const inputs of states) {
        TestBed.resetTestingModule();
        await TestBed.configureTestingModule({ imports: [component, TranslateModule.forRoot()] }).compileComponents();
        const fixture = TestBed.createComponent(component);
        for (const [input, value] of Object.entries(inputs)) fixture.componentRef.setInput(input, value);
        fixture.detectChanges();
        const icons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-icon'));
        rendered.push(...icons.map(icon => icon.textContent!.trim()).filter(Boolean));
      }

      expect(rendered.length).toBeGreaterThan(0);
      expect(rendered.filter(icon => !shipped.has(icon) || SVG_ONLY.includes(icon))).toEqual([]);
    });
  }
});
