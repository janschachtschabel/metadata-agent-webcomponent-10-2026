import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DefaultLayoutComponent } from './default-layout/default-layout.component';
import { DialogLayoutComponent } from './dialog-layout/dialog-layout.component';
import { PluginLayoutComponent } from './plugin-layout/plugin-layout.component';
import { CleanLayoutComponent } from './clean-layout/clean-layout.component';
import { JsonLoaderComponent } from '../json-loader/json-loader.component';
import { InputAreaComponent } from '../shared/input-area/input-area.component';
import { CanvasFieldState, CanvasState, FieldStatus, createInitialState } from '../../shared/models/canvas.models';
import { seriousA11yViolations } from '../../testing/a11y';

function filledState(contentTypeLabel?: string): CanvasState {
  const title = {
    fieldId: 'cclom:title', label: 'Titel', group: 'basics', groupLabel: 'Grunddaten',
    groupOrder: 1, schemaName: 'Core', aiFillable: true, repoField: true,
    status: FieldStatus.FILLED, value: 'Bruchrechnung', confidence: 1, isRequired: true,
    datatype: 'string', multiple: false,
  } as unknown as CanvasFieldState;
  return {
    ...createInitialState(),
    coreFields: [title],
    fieldGroups: [{ id: 'Core-basics', label: 'Grunddaten', schemaName: 'Core', fields: [title], isCore: true }],
    totalFields: 1,
    filledFields: 1,
    contentTypeLabel,
  };
}

async function render<T>(layout: Type<T>, inputs: Record<string, unknown>) {
  await TestBed.configureTestingModule({
    imports: [layout, TranslateModule.forRoot(), NoopAnimationsModule],
  }).compileComponents();
  const translate = TestBed.inject(TranslateService);
  translate.setTranslation('de', { LAYOUT: { ALL_FIELDS: 'Alle Felder', CORE_FIELDS: 'Basis' } });
  translate.use('de');
  const fixture = TestBed.createComponent(layout);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

/**
 * Audit U-02: the upload button stayed active while the request was out; a
 * second click created the node in the repository twice.
 */
const WITH_UPLOAD: [string, Type<unknown>][] = [
  ['default', DefaultLayoutComponent],
  ['dialog', DialogLayoutComponent],
  ['plugin', PluginLayoutComponent],
];

for (const [name, layout] of WITH_UPLOAD) {
  describe(`${name} layout upload button`, () => {
    function uploadButton(root: HTMLElement): HTMLButtonElement {
      return Array.from(root.querySelectorAll('button'))
        .find(b => b.textContent!.includes('cloud_upload')) as HTMLButtonElement;
    }

    // Release review 18.10. (pre-existing): a focused button that becomes
    // `disabled` hands the focus to <body>, so the result notice could not
    // return it to the trigger (U-05). While uploading it is aria-disabled;
    // the canvas ignores clicks meanwhile (U-02).
    it('keeps the focus and is announced as unavailable while an upload runs', async () => {
      const fixture = await render(layout, { state: filledState(), showUploadButton: true, uploading: false });
      const button = uploadButton(fixture.nativeElement);
      button.focus();

      fixture.componentRef.setInput('uploading', true);
      fixture.detectChanges();

      expect(button.disabled).withContext('native disabled drops the focus').toBeFalse();
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(button);
      expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
    });

    // Follow-up review 18.10.: the styles keyed on :disabled only, so the
    // aria-disabled button kept its active look during the upload.
    it('looks unavailable while an upload runs', async () => {
      const fixture = await render(layout, { state: filledState(), showUploadButton: true, uploading: true });
      const button = uploadButton(fixture.nativeElement);

      expect(Number(getComputedStyle(button).opacity)).toBeLessThan(1);
      expect(getComputedStyle(button).color).not.toBe('rgb(0, 135, 77)'); // the default layout's "ready" green
    });

    // Final audit 18.10. (L-10): the upload button stayed active during an
    // extraction and sent the form as it was before the result.
    it('is unavailable while an extraction runs, and keeps the focus', async () => {
      const fixture = await render(layout, { state: filledState(), showUploadButton: true, uploading: false });
      const button = uploadButton(fixture.nativeElement);
      let uploads = 0;
      (fixture.componentInstance as any).upload.subscribe(() => uploads++);
      button.focus();

      fixture.componentRef.setInput('state', { ...filledState(), isExtracting: true });
      fixture.detectChanges();
      button.click();

      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.disabled).toBeFalse();
      expect(document.activeElement).toBe(button);
      expect(uploads).toBe(0);
    });

    it('stays disabled while nothing is filled', async () => {
      const fixture = await render(layout, { state: createInitialState(), showUploadButton: true, uploading: false });

      expect(uploadButton(fixture.nativeElement).disabled).toBeTrue();
    });

    it('is enabled otherwise', async () => {
      const fixture = await render(layout, { state: filledState(), showUploadButton: true, uploading: false });

      expect(uploadButton(fixture.nativeElement).disabled).toBeFalse();
    });
  });
}

describe('default layout JSON loader', () => {
  it('passes on that a file could not be read (U-11)', async () => {
    const fixture = await render(DefaultLayoutComponent, { state: filledState() });
    const layout = fixture.componentInstance as DefaultLayoutComponent;
    let reported = 0;
    layout.jsonLoadError.subscribe(() => reported++);

    const loader = fixture.debugElement.query(By.directive(JsonLoaderComponent)).componentInstance as JsonLoaderComponent;
    loader.loadError.emit();

    expect(reported).toBe(1);
  });
});

/**
 * Audit M-06 and U-09 for the merged group of `flat-groups`: its heading was a
 * fixed German "Felder", and it was rebuilt open on every change.
 */
for (const [name, layout] of [['default', DefaultLayoutComponent], ['clean', CleanLayoutComponent]] as [string, Type<unknown>][]) {
  describe(`${name} layout with flat groups`, () => {
    function toggle(root: HTMLElement): HTMLButtonElement {
      return root.querySelector('.group-header button') as HTMLButtonElement;
    }

    it('names the merged group in the current language', async () => {
      const fixture = await render(layout, { state: filledState(), flatGroups: true });

      expect(toggle(fixture.nativeElement).textContent!.trim()).toBe('Alle Felder');
    });

    it('keeps the merged group collapsed when the state changes', async () => {
      const fixture = await render(layout, { state: filledState('Veranstaltung'), flatGroups: true });
      toggle(fixture.nativeElement).click();
      fixture.detectChanges();

      fixture.componentRef.setInput('state', { ...filledState('Veranstaltung'), filledFields: 1 });
      fixture.detectChanges();

      expect(toggle(fixture.nativeElement).getAttribute('aria-expanded')).toBe('false');
    });
  });
}

describe('default layout group badge', () => {
  it('names the core schema in the current language', async () => {
    const fixture = await render(DefaultLayoutComponent, { state: filledState() });

    expect(fixture.nativeElement.querySelector('.schema-badge').textContent.trim()).toBe('Basis');
  });

  // Final audit 18.10. (U-2): the type's badge showed a name derived from the
  // file name ("Learning Material"), not the type's label in the current language.
  it('names a content type by its label', async () => {
    const state = filledState('Lernmaterial');
    const special = { ...state.coreFields[0], fieldId: 'ccm:x', schemaName: 'Learning Material' } as CanvasFieldState;
    const fixture = await render(DefaultLayoutComponent, {
      state: {
        ...state,
        specialFields: [special],
        fieldGroups: [...state.fieldGroups, { id: 'Learning Material-g', label: 'Didaktik', schemaName: 'Learning Material', fields: [special], isCore: false }],
      },
    });

    const badges = Array.from(fixture.nativeElement.querySelectorAll('.schema-badge') as NodeListOf<HTMLElement>).map(b => b.textContent!.trim());
    expect(badges).toEqual(['Basis', 'Lernmaterial']);
  });
});

/**
 * Final audit 18.10. (U-1): the focused start button became natively disabled
 * when the extraction started, and the focus fell to <body>.
 */
for (const [name, layout] of [['default', DefaultLayoutComponent], ['input area', InputAreaComponent]] as [string, Type<unknown>][]) {
  describe(`${name} extraction button`, () => {
    const extracting = (on: boolean) => name === 'default'
      ? { state: { ...filledState(), isExtracting: on } }
      : { isExtracting: on };

    it('keeps the focus and is announced as unavailable while the extraction runs', async () => {
      const fixture = await render(layout, { userText: 'Ein Text', ...extracting(false) });
      const button = fixture.nativeElement.querySelector('.btn-extract') as HTMLButtonElement;
      let started = 0;
      (fixture.componentInstance as any).startExtraction.subscribe(() => started++);
      button.focus();

      for (const [input, value] of Object.entries(extracting(true))) fixture.componentRef.setInput(input, value);
      fixture.detectChanges();
      button.click();

      expect(button.disabled).withContext('native disabled drops the focus').toBeFalse();
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(button);
      expect(started).toBe(0);
      expect(await seriousA11yViolations(fixture.nativeElement)).toEqual([]);
    });

    it('Ctrl+Enter starts nothing while the extraction runs', async () => {
      const fixture = await render(layout, { userText: 'Ein Text', ...extracting(true) });
      let started = 0;
      (fixture.componentInstance as any).startExtraction.subscribe(() => started++);

      fixture.nativeElement.querySelector('textarea').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));

      expect(started).toBe(0);
    });
  });
}

/**
 * Audit U-16: Enter in the description box was swallowed - no new line, no
 * action. Enter now adds a line as in any text box; Ctrl+Enter (Cmd+Enter)
 * starts the extraction.
 */
describe('description box keys', () => {
  function press(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  it('Enter adds a new line in the default layout', async () => {
    const fixture = await render(DefaultLayoutComponent, { userText: 'Zeile 1' });
    const box = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    expect(press(box, { key: 'Enter' }).defaultPrevented).toBeFalse();
  });

  it('Ctrl+Enter starts the extraction in the default layout', async () => {
    const fixture = await render(DefaultLayoutComponent, { userText: 'Zeile 1' });
    const layout = fixture.componentInstance as DefaultLayoutComponent;
    let started = 0;
    layout.startExtraction.subscribe(() => started++);

    press(fixture.nativeElement.querySelector('textarea'), { key: 'Enter', ctrlKey: true });

    expect(started).toBe(1);
  });

  it('Enter adds a new line in the shared input area', async () => {
    const fixture = await render(InputAreaComponent, { userText: 'Zeile 1' });
    const box = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    expect(press(box, { key: 'Enter' }).defaultPrevented).toBeFalse();
  });

  it('Ctrl+Enter starts the extraction in the shared input area', async () => {
    const fixture = await render(InputAreaComponent, { userText: 'Zeile 1' });
    let started = 0;
    (fixture.componentInstance as InputAreaComponent).startExtraction.subscribe(() => started++);

    press(fixture.nativeElement.querySelector('textarea'), { key: 'Enter', metaKey: true });

    expect(started).toBe(1);
  });

  it('Ctrl+Enter does nothing without text', async () => {
    const fixture = await render(InputAreaComponent, { userText: '   ' });
    let started = 0;
    (fixture.componentInstance as InputAreaComponent).startExtraction.subscribe(() => started++);

    press(fixture.nativeElement.querySelector('textarea'), { key: 'Enter', ctrlKey: true });

    expect(started).toBe(0);
  });
});
