/**
 * The canvas as the host page gets it - real layout, fields, CanvasService and
 * SchemaService - with only the HTTP answers faked. For specs that follow a
 * value from the keyboard to the host's events (audit 13.11., W-TEST-01).
 */
import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoAnimationsModule } from './no-animations';
import { TranslateModule } from '@ngx-translate/core';

import { CanvasComponent } from '../components/canvas/canvas.component';
import { ApiService } from '../core/api.service';
import { CanvasService } from '../core/canvas.service';
import { ConfigService } from '../core/config.service';
import { I18nService } from '../core/i18n.service';
import { LoggerService } from '../core/logger.service';
import { SchemaService } from '../core/schema.service';

export const EVENT_URI = 'http://w3id.org/openeduhub/vocabs/contentTypes/event';

export const CORE_SCHEMA = {
  fields: [
    { id: 'cclom:title', label: { de: 'Titel' }, system: { datatype: 'string', multiple: false } },
    { id: 'cclom:general_keyword', label: { de: 'Schlagworte' }, system: { datatype: 'array', multiple: true, items: { datatype: 'string' } } },
    {
      id: 'ccm:oeh_extendedType',
      label: { de: 'Inhaltstyp' },
      system: {
        datatype: 'uri',
        ask_user: false,
        vocabulary: {
          type: 'closed',
          concepts: [
            { uri: EVENT_URI, label: { de: 'Veranstaltung' }, schema_file: 'event.json', icon: 'event' },
            { uri: 'http://w3id.org/openeduhub/vocabs/contentTypes/person', label: { de: 'Person' }, schema_file: 'person.json' },
          ],
        },
      },
    },
  ],
  groups: [],
};

export const EVENT_SCHEMA = {
  fields: [{ id: 'schema:startDate', label: { de: 'Beginn' }, system: { datatype: 'date', multiple: false } }],
  groups: [],
};

export const PERSON_SCHEMA = {
  fields: [{ id: 'schema:jobTitle', label: { de: 'Beruf' }, system: { datatype: 'string', multiple: false } }],
  groups: [],
};

/** A /generate answer as ApiService hands it on. */
export function generated(metadataset: string, metadata: Record<string, unknown>, processing: Record<string, unknown> = {}): unknown {
  return {
    contextName: 'default',
    schemaVersion: '2.0.0',
    metadataset,
    metadata: { ...metadata },
    _origins: {},
    _source_text: 'Quelltext',
    processing: {
      success: true, fields_extracted: 1, fields_total: 1, processing_time_ms: 1,
      llm_provider: 'x', llm_model: 'y', errors: [], warnings: [], status: 'success',
      ...processing,
    },
  };
}

export interface CanvasHarness {
  fixture: ComponentFixture<CanvasComponent>;
  component: CanvasComponent;
  canvas: CanvasService;
  root: HTMLElement;
  api: { getSchema: jasmine.Spy; generate: jasmine.Spy; upload: jasmine.Spy };
  /** Lets pending promises and timers run and renders the result. */
  settle(): Promise<void>;
  /** Sets an input as the host page does, including ngOnChanges. */
  set(name: string, value: unknown): Promise<void>;
  /** The form control of the field labelled `label`. */
  control(label: string): HTMLInputElement | HTMLTextAreaElement;
}

/** The browser's setTimeout, before a spec puts jasmine's clock in its place. */
const realSetTimeout = setTimeout;

/**
 * One turn of the event loop: pending promises settle, and so do timers
 * without a delay. A spec that waits for a debounce installs jasmine's clock
 * and moves it (`jasmine.clock().tick(120)`) instead of waiting on the wall
 * clock (audit 14.11., U-16); then the timers due on that clock run here,
 * and the turn itself still is a real one.
 */
export function turn(): Promise<void> {
  if (setTimeout !== realSetTimeout) jasmine.clock().tick(0);
  return new Promise(resolve => realSetTimeout(resolve));
}

let mounted = 0;

export const DEFAULT_SCHEMAS: Record<string, unknown> = { 'core.json': CORE_SCHEMA, 'event.json': EVENT_SCHEMA, 'person.json': PERSON_SCHEMA };

export type FakeApi = CanvasHarness['api'];

/**
 * Configures TestBed for the canvas with the agent faked (`schemas` by file);
 * returns the fake. Shared by the fixture harness below and the specs of the
 * custom element (canvas-element.spec.ts).
 */
export async function configureCanvasTestBed(
  schemas: Record<string, unknown> = DEFAULT_SCHEMAS,
  providers: Provider[] = [],
): Promise<FakeApi> {
  const api = {
    getSchema: jasmine.createSpy('getSchema').and.callFake((_context: string, _version: string, file: string) =>
      schemas[file] ? Promise.resolve(schemas[file]) : Promise.reject(new Error(`no schema ${file}`))),
    generate: jasmine.createSpy('generate'),
    upload: jasmine.createSpy('upload').and.resolveTo({ success: true, node: { nodeId: 'n1' } }),
    captureScreenshot: () => Promise.resolve(null),
    setApiUrl: () => undefined,
    getApiUrl: () => '',
  };
  const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} };
  await TestBed.configureTestingModule({
    imports: [CanvasComponent, TranslateModule.forRoot(), NoAnimationsModule],
    providers: [
      { provide: ApiService, useValue: api },
      { provide: LoggerService, useValue: quiet },
      { provide: ConfigService, useValue: quiet },
      {
        provide: SchemaService,
        useFactory: (config: ConfigService, i18n: I18nService) => new SchemaService(config, i18n, api as any),
        deps: [ConfigService, I18nService],
      },
      ...providers,
    ],
  }).compileComponents();
  TestBed.inject(I18nService).setLanguage('de');
  return api;
}

export async function mountCanvas(
  inputs: Record<string, unknown> = {},
  schemas: Record<string, unknown> = DEFAULT_SCHEMAS,
): Promise<CanvasHarness> {
  const api = await configureCanvasTestBed(schemas);
  // An instance of its own: state is shared by instance-id across the page.
  return mountElement(api, `harness-${++mounted}`, inputs);
}

/** Another element on the instance of `harness`, as a host page with two views of one form has it. */
export function mountSibling(harness: CanvasHarness, inputs: Record<string, unknown> = {}): Promise<CanvasHarness> {
  return mountElement(harness.api, harness.canvas.instanceId, inputs);
}

async function mountElement(api: FakeApi, instanceId: string, inputs: Record<string, unknown>): Promise<CanvasHarness> {
  const fixture = TestBed.createComponent(CanvasComponent);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      fixture.detectChanges();
      await turn();
    }
    fixture.detectChanges();
  };
  const set = async (name: string, value: unknown): Promise<void> => {
    fixture.componentRef.setInput(name, value);
    await settle();
  };
  fixture.componentRef.setInput('instanceId', instanceId);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  await settle();

  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    component: fixture.componentInstance,
    canvas: fixture.debugElement.injector.get(CanvasService),
    root,
    api,
    settle,
    set,
    control: (label: string) => {
      const field = Array.from(root.querySelectorAll('app-field'))
        .find(el => el.querySelector('mat-label, .radio-field-label')?.textContent?.trim().startsWith(label));
      if (!field) throw new Error(`no field labelled "${label}"`);
      return field.querySelector('textarea[matInput], input[matInput]') as HTMLInputElement | HTMLTextAreaElement;
    },
  };
}

/** Types `text` into a control as the keyboard does and leaves it. */
export function typeAndLeave(control: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  control.focus();
  control.value = text;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
  control.dispatchEvent(new FocusEvent('blur'));
}
