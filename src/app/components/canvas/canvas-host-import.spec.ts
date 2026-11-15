/**
 * What the host page hands in - `metadata-input` and `content-type` - must end
 * up in the form as in 2.1.1, except for the deviations the CHANGELOG
 * documents (final audit 18.10., F1/F2):
 *
 * - F1: review-demo.html sets content-type as an attribute and metadataInput
 *   after whenDefined. The type, applied once the core schema was loaded,
 *   superseded the import that was still loading - the form stayed empty.
 * - F2: README: `el.metadataInput = {plain metadata}; el.contentType = 'event.json'`.
 *   The import without metadataset cleared the type the host had just set.
 *
 * Real CanvasService and SchemaService; only the HTTP answers are faked.
 */
import { BehaviorSubject } from 'rxjs';
import { CanvasComponent } from './canvas.component';
import { CanvasService } from '../../core/canvas.service';
import { SchemaService } from '../../core/schema.service';
import { ShapeExpanderService } from '../../core/shape-expander.service';
import { CanvasState } from '../../shared/models/canvas.models';
import { turn } from '../../testing/canvas-harness';

const EVENT_URI = 'http://w3id.org/openeduhub/vocabs/contentTypes/event';

const CORE = {
  fields: [
    { id: 'cclom:title', label: { de: 'Titel' }, system: { datatype: 'string', multiple: false } },
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
const EVENT = {
  fields: [{ id: 'schema:startDate', label: { de: 'Beginn' }, system: { datatype: 'string', multiple: false } }],
  groups: [],
};
const PERSON = {
  fields: [{ id: 'schema:jobTitle', label: { de: 'Beruf' }, system: { datatype: 'string', multiple: false } }],
  groups: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => (resolve = res));
  return { promise, resolve };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await turn();
  }
}

let instanceCounter = 0;

/** A /generate answer for `metadataset`. */
function generated(metadataset: string, metadata: Record<string, unknown>): unknown {
  return {
    metadataset,
    metadata: { ...metadata, _origins: {}, _source_text: 'Quelltext' },
    processing: {
      success: true, fields_extracted: 1, fields_total: 1, processing_time_ms: 1,
      llm_provider: 'x', llm_model: 'y', errors: [], warnings: [], status: 'success',
    },
  };
}

describe('CanvasComponent: metadata-input and content-type from the host', () => {
  let component: CanvasComponent;
  let canvas: CanvasService;
  let coreAnswer: Promise<unknown>;
  let generate: jasmine.Spy;
  let upload: jasmine.Spy;

  function create(): void {
    const i18n = { currentLang: 'de', language$: new BehaviorSubject('de'), instant: (key: string) => key };
    generate = jasmine.createSpy('generate');
    upload = jasmine.createSpy('upload').and.resolveTo({ success: true, node: { nodeId: 'n1' } });
    const api = {
      getSchema: (_context: string, _version: string, file: string) => {
        if (file === 'core.json') return coreAnswer;
        if (file === 'event.json') return Promise.resolve(EVENT);
        if (file === 'person.json') return Promise.resolve(PERSON);
        return Promise.reject(new Error(`no schema ${file}`));
      },
      generate,
      upload,
    };
    const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} };
    const schema = new SchemaService(quiet as any, i18n as any, api as any);
    canvas = new CanvasService(schema, api as any, i18n as any, quiet as any, new ShapeExpanderService(schema), { run: (fn: () => unknown) => fn() } as any);
    component = new CanvasComponent(
      canvas,
      schema,
      api as any,
      {} as any,
      i18n as any,
      { markForCheck: () => undefined } as any,
      { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() } as any,
    );
    component.instanceId = `host-import-${++instanceCounter}`;
    spyOn<any>(component, 'renderLayout');
  }

  function setMetadataInput(value: Record<string, unknown>, firstChange = false): void {
    component.metadataInput = value;
    component.ngOnChanges({ metadataInput: { currentValue: value, previousValue: null, firstChange, isFirstChange: () => firstChange } as any });
  }

  function state(): CanvasState {
    return canvas.getCurrentState();
  }
  function valueOf(fieldId: string): unknown {
    return [...state().coreFields, ...state().specialFields].find(f => f.fieldId === fieldId)?.value;
  }

  const REVIEW_DEMO_INPUT = {
    contextName: 'default',
    metadataset: 'event.json',
    metadataset_uri: EVENT_URI,
    metadata: { 'cclom:title': 'Goethe und die Frauen', 'schema:startDate': '2026-03-10T20:00' },
    _origins: { 'cclom:title': 'ai', 'schema:startDate': 'ai' },
  };

  beforeEach(() => {
    coreAnswer = Promise.resolve(CORE);
    create();
  });

  afterEach(() => component.ngOnDestroy());

  describe('F1: content-type attribute and an import at page start', () => {
    it('keeps the import when both are set before ngOnInit', async () => {
      component.contentType = EVENT_URI;
      setMetadataInput(REVIEW_DEMO_INPUT, true);
      void component.ngOnInit();
      await settle();

      expect(state().selectedContentType).toBe('event.json');
      expect(valueOf('cclom:title')).toBe('Goethe und die Frauen');
      expect(valueOf('schema:startDate')).toBe('2026-03-10T20:00');
      expect(state().filledFields).toBe(2);
    });

    it('keeps the import set while the core schema is loading (review-demo.html)', async () => {
      const core = deferred<unknown>();
      coreAnswer = core.promise;
      component.contentType = EVENT_URI;
      void component.ngOnInit();
      await settle();
      setMetadataInput(REVIEW_DEMO_INPUT); // customElements.whenDefined(...).then(...)
      core.resolve(CORE);
      await settle();

      expect(state().selectedContentType).toBe('event.json');
      expect(valueOf('cclom:title')).toBe('Goethe und die Frauen');
      expect(valueOf('schema:startDate')).toBe('2026-03-10T20:00');
    });

    it('still applies a content-type that differs from the import\'s metadataset', async () => {
      component.contentType = 'person.json';
      setMetadataInput(REVIEW_DEMO_INPUT, true);
      void component.ngOnInit();
      await settle();

      expect(state().selectedContentType).toBe('person.json');
      expect(valueOf('cclom:title')).toBe('Goethe und die Frauen');
    });
  });

  describe('F2: an import without metadataset and the type the host set', () => {
    const PLAIN = { 'cclom:title': 'Mein Titel', 'schema:startDate': '2026-05-03' };

    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('contentType set right after metadataInput (README): the type stays and its fields are filled', async () => {
      // A property setter runs at once, ngOnChanges with the next change detection.
      component.contentType = 'event.json';
      setMetadataInput(PLAIN);
      await settle();

      expect(state().selectedContentType).toBe('event.json');
      expect(valueOf('cclom:title')).toBe('Mein Titel');
      expect(valueOf('schema:startDate')).toBe('2026-05-03');
    });

    it('contentType set after the import was processed: the type gets the imported values', async () => {
      setMetadataInput(PLAIN);
      component.contentType = 'event.json';
      await settle();

      expect(state().selectedContentType).toBe('event.json');
      expect(valueOf('cclom:title')).toBe('Mein Titel');
      expect(valueOf('schema:startDate')).toBe('2026-05-03');
    });

    it('contentType set once the import has finished: the type gets the imported values', async () => {
      setMetadataInput(PLAIN);
      await settle();
      component.contentType = 'event.json';
      await settle();

      expect(state().selectedContentType).toBe('event.json');
      expect(valueOf('schema:startDate')).toBe('2026-05-03');
    });

    // W-L6: README documents 'core.json' ("Allgemein"); it added every core
    // field a second time as a field of the type.
    it('contentType core.json: no type, the core fields once', async () => {
      setMetadataInput(REVIEW_DEMO_INPUT);
      await settle();

      component.contentType = 'core.json';
      await settle();

      const ids = [...state().coreFields, ...state().specialFields].map(f => f.fieldId);
      expect(state().specialFields).toEqual([]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(state().selectedContentType).toBeNull();
      expect(state().contentTypeLabel).toBeUndefined();
      expect(valueOf('cclom:title')).toBe('Goethe und die Frauen');
    });

    it('after a previous page with a host type: the host type, but none of that page\'s values', async () => {
      component.contentType = 'event.json';
      setMetadataInput(REVIEW_DEMO_INPUT);
      await settle();
      setMetadataInput({ 'cclom:title': 'Nächste Seite' });
      await settle();

      expect(state().selectedContentType).toBe('event.json');
      expect(valueOf('schema:startDate')).withContext('stale value of the previous page').toBeNull();
      expect(valueOf('cclom:title')).toBe('Nächste Seite');
    });
  });

  /** Where 3.0 differs from 2.1.1 on purpose (CHANGELOG 3.0.0, F2). */
  describe('documented deviations from 2.1.1 (2.1.1 kept the previous type)', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('after a previous page without a host type: no type and no fields of that page', async () => {
      setMetadataInput(REVIEW_DEMO_INPUT);
      await settle();
      setMetadataInput({ 'cclom:title': 'Nächste Seite' });
      await settle();

      expect(state().selectedContentType).toBeNull();
      expect(state().specialFields).toEqual([]);
      expect(valueOf('cclom:title')).toBe('Nächste Seite');
    });

    // Review 18.10.: the import took the host's type although the editor had
    // chosen another one since; the form was rebuilt as an event.
    it('after the editor picked another type than the host: not the host type', async () => {
      component.contentType = 'event.json';
      setMetadataInput(REVIEW_DEMO_INPUT);
      await settle();
      await component.selectContentType({ label: 'Person', schemaFile: 'person.json', icon: 'person' });
      expect(state().selectedContentType).toBe('person.json');

      setMetadataInput({ 'cclom:title': 'Nächste Seite' });
      await settle();

      expect(state().selectedContentType).toBeNull();
      expect(valueOf('schema:startDate')).withContext('field of the host type').toBeUndefined();
      expect(valueOf('cclom:title')).toBe('Nächste Seite');
    });
  });

  // Review 18.10. (F1/F2 host queue): a type the host set re-runs the
  // extraction from the import's source text. The next metadata-input (the
  // Prüftisch moves on) waited for that run, up to ~110 s, and the previous
  // node's AI result landed in the form before it was replaced.
  describe('a metadata-input while the host type re-runs the extraction', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('is applied at once, and the result of the re-run is dropped', async () => {
      let answer!: (value: unknown) => void;
      generate.and.returnValue(new Promise(resolve => (answer = resolve)));
      setMetadataInput({ ...REVIEW_DEMO_INPUT, _source_text: 'Goethe und die Frauen, Vortrag' });
      await settle();
      component.contentType = 'person.json';
      await settle();
      expect(generate).withContext('re-run for the host type').toHaveBeenCalledTimes(1);

      setMetadataInput({ metadataset: 'event.json', metadata: { 'cclom:title': 'Nächster Node' } });
      await settle();

      expect(valueOf('cclom:title')).toBe('Nächster Node');
      answer(generated('person.json', { 'cclom:title': 'Voriger Node (KI)', 'schema:jobTitle': 'Dichter' }));
      await settle();
      expect(valueOf('cclom:title')).toBe('Nächster Node');
      expect(state().selectedContentType).toBe('event.json');
      expect(state().isExtracting).toBeFalse();
    });
  });

  // Audit 13.11. (W-LOG-08): enable-screenshot, screenshot-method and
  // preview-image live in the state only. A reset put a fresh state in its
  // place, another instance-id a different one - the element kept its
  // attributes, the widget had forgotten them.
  describe('what the host set for screenshots and the preview image', () => {
    const IMAGE = 'data:image/png;base64,HOST';

    function hostSettings(): void {
      component.enableScreenshot = 'false';
      component.screenshotMethod = 'pageshot';
      component.previewImage = IMAGE;
    }
    function settings(): unknown[] {
      return [state().screenshotEnabled, state().screenshotMethod, state().previewImageUrl];
    }

    it('survives the reset the editor confirmed', async () => {
      hostSettings();

      const reset = component.reset();
      component.onNoticeClosed(true);
      await reset;

      expect(settings()).toEqual([false, 'pageshot', IMAGE]);
    });

    it('survives a reset by the host (force-reset)', () => {
      hostSettings();

      component.forceReset = true;

      expect(settings()).toEqual([false, 'pageshot', IMAGE]);
    });

    it('goes along to another instance-id, whatever the order of the attributes', () => {
      hostSettings();

      component.instanceId = `host-import-${++instanceCounter}`;

      expect(settings()).toEqual([false, 'pageshot', IMAGE]);
    });

    it('is not overwritten by an element that joins the instance without settings of its own', () => {
      hostSettings();
      const joining = new CanvasComponent(
        new CanvasService({} as any, {} as any, {} as any, { info: () => {} } as any, {} as any, {} as any),
        {} as any, {} as any, {} as any, {} as any,
        { markForCheck: () => undefined } as any,
        { run: (fn: () => unknown) => fn() } as any,
      );

      joining.instanceId = `host-import-${instanceCounter}`;

      expect(settings()).toEqual([false, 'pageshot', IMAGE]);
      joining.ngOnDestroy();
    });
  });

  // Review 18.10. (W-L1 vs. 2.1.1): 2.1.1 returned every key of an imported
  // record in its events and upload. The events keep the import's keys again;
  // only the upload (ccm:oeh_extendedData) is limited to the form's schemas.
  describe('keys of an import that the form has no field for', () => {
    beforeEach(async () => {
      jasmine.clock().install(); // the 50 ms debounce passes on this clock (audit 14.11., U-16)
      await component.ngOnInit();
    });
    afterEach(() => jasmine.clock().uninstall());

    async function changeEvent(): Promise<Record<string, any>> {
      const emitted: Record<string, any>[] = [];
      component.metadataChange.subscribe(value => emitted.push(value));
      jasmine.clock().tick(60); // debounced 50 ms
      return emitted[emitted.length - 1];
    }

    it('are in metadataChange and metadataSubmit, not in the upload', async () => {
      setMetadataInput({ metadataset: 'event.json', metadata: { 'cclom:title': 'Titel', 'ccm:unbekannt': 'x' } });
      await settle();
      const submitted: Record<string, any>[] = [];
      component.metadataSubmit.subscribe(value => submitted.push(value));

      component.submit();
      await component.uploadToRepository();

      expect((await changeEvent())['metadata']['ccm:unbekannt']).toBe('x');
      expect(submitted[0]['metadata']['ccm:unbekannt']).toBe('x');
      const uploaded = upload.calls.mostRecent().args[0].metadata.metadata;
      expect(uploaded['ccm:unbekannt']).toBeUndefined();
      expect(uploaded['cclom:title']).toBe('Titel');
    });

    it('an import without any type: its type-specific values are in the events, not in the upload', async () => {
      setMetadataInput({ 'cclom:title': 'Titel', 'schema:startDate': '2026-05-03' });
      await settle();

      await component.uploadToRepository();

      expect((await changeEvent())['metadata']['schema:startDate']).toBe('2026-05-03');
      expect(upload.calls.mostRecent().args[0].metadata.metadata['schema:startDate']).toBeUndefined();
    });
  });
});
