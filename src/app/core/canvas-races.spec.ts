/**
 * A run that has been overtaken must not write into the form (audit L-01), and
 * a content-type switch must not lose what the editor typed (audit U-06).
 *
 * The generation counter guarded the answer of /generate, but not the awaits
 * after it: a reset, a type choice or a JSON import during `prepareSpecialFields`
 * was overwritten by the old page's values. And three entry points that replace
 * the form did not advance the counter at all.
 */

import { CanvasService } from './canvas.service';
import { ShapeExpanderService } from './shape-expander.service';
import { GenerateResponse } from './api.service';
import { CanvasFieldState, FieldStatus } from '../shared/models/canvas.models';
import { InstanceRegistry } from './instance-registry';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const TITLE = {
  id: 'cclom:title',
  label: { de: 'Titel' },
  system: { path: 'cclom:title', datatype: 'string', multiple: false },
};
const START_DATE = {
  id: 'schema:startDate',
  label: { de: 'Beginn' },
  system: { path: 'schema:startDate', datatype: 'string', multiple: false },
};

const CONTACT_POINT = {
  id: 'schema:contactPoint',
  label: { de: 'Kontaktstelle' },
  system: {
    path: 'schema:contactPoint',
    datatype: 'array',
    multiple: true,
    items: {
      datatype: 'object',
      discriminator: '@type',
      variants: [{
        '@type': 'ContactPoint',
        fields: [
          { id: 'contactType', label: { de: 'Kontakttyp' }, system: { datatype: 'string' } },
          { id: 'email', label: { de: 'E-Mail' }, system: { datatype: 'string' } },
        ],
      }],
    },
  },
};

function response(metadata: Record<string, any>, metadataset = 'event.json'): GenerateResponse {
  return {
    contextName: 'default',
    schemaVersion: 'latest',
    metadataset,
    language: 'de',
    exportedAt: '2026-10-17T00:00:00Z',
    metadata,
    processing: {
      success: true,
      fields_extracted: 1,
      fields_total: 1,
      processing_time_ms: 1,
      llm_provider: 'b-api-openai',
      llm_model: 'test-model',
      errors: [],
      warnings: [],
      status: 'success',
    },
  } as GenerateResponse;
}

function field(fieldId: string, overrides: Partial<CanvasFieldState> = {}): CanvasFieldState {
  return {
    fieldId,
    label: fieldId,
    group: 'g',
    groupLabel: 'G',
    groupOrder: 1,
    schemaName: 'Core',
    aiFillable: true,
    repoField: true,
    status: FieldStatus.EMPTY,
    value: null,
    confidence: 0,
    isRequired: false,
    datatype: 'string',
    multiple: false,
    ...overrides,
  } as CanvasFieldState;
}

describe('CanvasService runs that have been overtaken', () => {
  let service: CanvasService;
  let generate: jasmine.Spy;
  let eventFields: ReturnType<typeof deferred<any[]>>;
  let eventFieldsRequested: boolean;
  let coreFields: Promise<any[]>;
  let create: () => CanvasService;

  beforeEach(() => {
    eventFields = deferred<any[]>();
    eventFieldsRequested = false;
    coreFields = Promise.resolve([TITLE]);
    const byId: Record<string, any> = { 'cclom:title': TITLE, 'schema:startDate': START_DATE, 'schema:contactPoint': CONTACT_POINT };
    const schema = {
      getFields: (file: string) => {
        if (file === 'core.json') return coreFields;
        eventFieldsRequested = true;
        return eventFields.promise;
      },
      getGroups: () => Promise.resolve([]),
      getFieldById: (id: string) => byId[id],
      getActiveLanguage: () => 'de',
      getContextName: () => 'default',
      localizeString: (v: any) => (typeof v === 'string' ? v : v?.de || ''),
      localizeVocabulary: () => [],
      localizeFieldFull: (f: any) => ({ label: f.label?.de || f.id }),
      getFallbackGroupLabel: () => 'Weitere',
      getContentTypeConcepts: () => [{ label: 'Veranstaltung', schema_file: 'event.json' }],
      resolveSchemaFileOrUri: (v: string) => v,
    };
    generate = jasmine.createSpy('generate');
    create = () => new CanvasService(
      schema as any,
      { generate } as any,
      { currentLang: 'de', instant: (key: string) => key } as any,
      { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, group: () => {}, groupEnd: () => {} } as any,
      new ShapeExpanderService(schema as any),
      { run: (fn: () => unknown) => fn() } as any,
    );
    service = create();
  });

  it('without interruption the generated values land (control)', async () => {
    generate.and.resolveTo(response({ 'cclom:title': 'Neue Seite', 'schema:startDate': '2026-05-03' }));

    const run = service.startExtraction('Seite A');
    await flush();
    eventFields.resolve([START_DATE]);
    await run;

    const state = service.getCurrentState();
    expect(state.extractionError).toBeNull();
    expect(state.selectedContentType).toBe('event.json');
    expect(state.coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Neue Seite');
  });

  it('a reset while the new type is being prepared stays a reset', async () => {
    generate.and.resolveTo(response({ 'cclom:title': 'Alte Seite', 'schema:startDate': '2026-05-03' }));

    const run = service.startExtraction('Seite A');
    await flush();
    expect(eventFieldsRequested).withContext('prepareSpecialFields is waiting').toBeTrue();
    service.reset();
    eventFields.resolve([START_DATE]);
    await run;

    const state = service.getCurrentState();
    expect(state.coreFields).toEqual([]);
    expect(state.specialFields).toEqual([]);
    expect(state.selectedContentType).toBeFalsy();
    expect(state.metadata).toEqual({});
  });

  it('a type chosen during an extraction replaces it with a run for that type', async () => {
    const pending = deferred<GenerateResponse>();
    generate.and.callFake((req: { schema_file?: string }) =>
      req.schema_file === 'learning_material.json'
        ? Promise.resolve(response({ 'cclom:title': 'Neue Seite' }, 'learning_material.json'))
        : pending.promise
    );
    spyOn(service as any, 'loadSpecialSchema').and.resolveTo();

    const run = service.startExtraction('Seite A');
    await flush();
    const choice = service.selectContentType('learning_material.json');
    pending.resolve(response({ 'cclom:title': 'Alte Seite' }));
    eventFields.resolve([START_DATE]);
    await Promise.all([run, choice]);

    const state = service.getCurrentState();
    expect(generate.calls.mostRecent().args[0].schema_file)
      .withContext('the request is not silently dropped').toBe('learning_material.json');
    expect(state.selectedContentType).toBe('learning_material.json');
    expect(state.coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Neue Seite');
    expect(state.isExtracting).toBeFalse();
  });

  it('a reset while a type switch rebuilds the form stays a reset', async () => {
    const core = deferred<any[]>();
    spyOn(service as any, 'loadSpecialSchema').and.resolveTo();
    generate.and.resolveTo(response({ 'cclom:title': 'Alte Seite' }));
    eventFields.resolve([START_DATE]);
    (service as any).updateState({ userText: 'Ein Text' });
    coreFields = core.promise;

    const run = (service as any).regenerateWithContentType('event.json');
    await flush(); // the answer is there, initializeCoreFields waits for the schema
    service.reset();
    core.resolve([TITLE]);
    await run;

    const state = service.getCurrentState();
    expect(state.coreFields).toEqual([]);
    expect(state.selectedContentType).toBeFalsy();
  });

  it('a run overtaken while the form is built sends no request', async () => {
    const core = deferred<any[]>();
    coreFields = core.promise;
    generate.and.resolveTo(response({}));

    const run = service.startExtraction('Seite A');
    await flush();
    service.reset();
    core.resolve([TITLE]);
    await run;

    expect(generate).withContext('a wasted call against the shared LLM limit').not.toHaveBeenCalled();
  });

  it('the label of a slower earlier type choice does not win', async () => {
    const first = deferred<void>();
    spyOn(service as any, 'loadSpecialSchema').and.callFake((file: string) =>
      file === 'a.json' ? first.promise : Promise.resolve()
    );

    const a = service.changeContentTypeManually('a.json', 'Typ A', 'a-icon');
    const b = service.changeContentTypeManually('b.json', 'Typ B', 'b-icon');
    await b;
    first.resolve();
    await a;

    const state = service.getCurrentState();
    expect(state.selectedContentType).toBe('b.json');
    expect(state.contentTypeLabel).toBe('Typ B');
    expect(state.contentTypeIcon).toBe('b-icon');
  });

  it('a JSON import during an extraction discards that extraction', async () => {
    const pending = deferred<GenerateResponse>();
    generate.and.returnValue(pending.promise);

    const run = service.startExtraction('Seite A');
    await flush();
    await service.importJsonData({ metadata: { 'cclom:title': 'Importiert' } });
    pending.resolve(response({ 'cclom:title': 'Alte Seite' }));
    eventFields.resolve([START_DATE]);
    await run;

    const state = service.getCurrentState();
    expect(state.coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Importiert');
    expect(state.isExtracting).toBeFalse();
  });

  // Audit L-01 (rest): the fields stay editable while a run is out, so what the
  // editor types meanwhile must win over the AI value that arrives afterwards.
  it('a value the editor types during an extraction is kept when the AI values arrive', async () => {
    const pending = deferred<GenerateResponse>();
    generate.and.returnValue(pending.promise);

    const run = service.startExtraction('Seite A');
    await flush(); // the core fields are built, the request is out
    service.updateFieldValue('cclom:title', 'Mein Titel');
    pending.resolve(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));
    await run;

    const state = service.getCurrentState();
    const title = state.coreFields.find(f => f.fieldId === 'cclom:title')!;
    expect(title.value).toBe('Mein Titel');
    expect(title.isAiGenerated).withContext('it stays the editor\'s value').toBeFalse();
    expect(state.metadata['cclom:title']).toBe('Mein Titel');
  });

  it('a value typed during a type switch survives the rebuilt form', async () => {
    spyOn(service as any, 'loadSpecialSchema').and.resolveTo();
    eventFields.resolve([START_DATE]);
    const pending = deferred<GenerateResponse>();
    generate.and.returnValue(pending.promise);
    (service as any).updateState({
      userText: 'Ein Text',
      coreFields: [field('cclom:title', { value: 'Alt', status: FieldStatus.FILLED, isAiGenerated: true })],
    });

    const run = (service as any).regenerateWithContentType('event.json');
    await flush();
    service.updateFieldValue('cclom:title', 'Mein Titel');
    pending.resolve(response({ 'cclom:title': 'KI-Titel' }));
    await run;

    const title = service.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')!;
    expect(title.value).toBe('Mein Titel');
    expect(title.isAiGenerated).toBeFalse();
  });

  it('an edit from before the run does not shield the field from the next run', async () => {
    service.updateFieldValue('cclom:title', 'Vorher'); // no run yet: an ordinary edit
    generate.and.resolveTo(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));

    await service.startExtraction('Seite A');

    // The backend decides about values that were there before (U-06, origins);
    // the widget only protects what changed while the request was out.
    expect(service.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')?.value)
      .toBe('KI-Titel');
  });

  // Audit U-09: the group header toggles `collapsed` on the group object; every
  // rebuild of the groups used to drop it and reopen all groups.
  describe('collapsed groups', () => {
    function collapseFirstGroup(): void {
      service.getCurrentState().fieldGroups[0].collapsed = true; // what the header button does
    }

    it('stay collapsed when a value changes', () => {
      const title = field('cclom:title');
      (service as any).updateState({
        coreFields: [title],
        fieldGroups: [{ id: 'Core-g', label: 'G', schemaName: 'Core', fields: [title], isCore: true }],
      });
      collapseFirstGroup();

      service.updateFieldValue('cclom:title', 'Neu');

      expect(service.getCurrentState().fieldGroups[0].collapsed).toBeTrue();
    });

    it('stay collapsed when the AI values arrive', async () => {
      const title = field('cclom:title', { value: 'Alt', status: FieldStatus.FILLED });
      (service as any).updateState({
        coreFields: [title],
        fieldGroups: [{ id: 'Core-g', label: 'G', schemaName: 'Core', fields: [title], isCore: true }],
      });
      collapseFirstGroup();
      generate.and.resolveTo(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));

      await service.startExtraction('Seite A');

      const state = service.getCurrentState();
      expect(state.coreFields[0].value).toBe('KI-Titel');
      expect(state.fieldGroups[0].collapsed).toBeTrue();
    });
  });

  it('a type switch sends the core values, so the editor\'s input survives', async () => {
    spyOn(service as any, 'loadSpecialSchema').and.resolveTo();
    generate.and.resolveTo(response({}));
    eventFields.resolve([START_DATE]);
    (service as any).updateState({
      userText: 'Ein Text',
      coreFields: [field('cclom:title', { value: 'Mein Titel', status: FieldStatus.FILLED, isAiGenerated: false })],
      specialFields: [field('ccm:oeh_lrt', { value: 'alt', status: FieldStatus.FILLED, schemaName: 'Learning Material' })],
    });

    await (service as any).regenerateWithContentType('event.json');

    const request = generate.calls.mostRecent().args[0];
    expect(request.schema_file).toBe('event.json');
    expect(request.existing_metadata['cclom:title']).toBe('Mein Titel');
    expect(request.existing_metadata['_origins']).toEqual({ 'cclom:title': 'user' });
    // Not the old type's fields, and not a source text that would turn the
    // request into a correction round of the same text.
    expect(request.existing_metadata['ccm:oeh_lrt']).toBeUndefined();
    expect(request.existing_metadata['_source_text']).toBeUndefined();
  });

  // Review 18.10. (L-01 false positives): a field emits on blur even when
  // nothing changed. Tabbing through the form during a run froze every field
  // against the AI value that was on its way.
  describe('a value that did not change', () => {
    it('blur without change during a run keeps the AI value', async () => {
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = service.startExtraction('Seite A');
      await flush();
      service.updateFieldValue('cclom:title', null); // the empty field emits null on blur
      pending.resolve(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));
      await run;

      const title = service.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')!;
      expect(title.value).toBe('KI-Titel');
      expect(title.isAiGenerated).toBeTrue();
    });

    it('re-entering the AI value during a re-extraction keeps the new AI value', async () => {
      (service as any).updateState({
        coreFields: [field('cclom:title', { value: 'Alt', status: FieldStatus.FILLED, isAiGenerated: true })],
      });
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = service.startExtraction('Seite A');
      await flush();
      service.updateFieldValue('cclom:title', 'Alt');
      pending.resolve(response({ 'cclom:title': 'Neu' }, 'core.json'));
      await run;

      const title = service.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')!;
      expect(title.value).toBe('Neu');
      expect(title.isAiGenerated).toBeTrue();
    });

    it('the same value again does not turn an AI value into the editor\'s', () => {
      (service as any).updateState({
        coreFields: [field('cclom:title', { value: 'KI-Titel', status: FieldStatus.FILLED, isAiGenerated: true })],
      });

      service.updateFieldValue('cclom:title', 'KI-Titel');

      expect(service.getCurrentState().coreFields[0].isAiGenerated)
        .withContext('the next run would send it as origin "user"').toBeTrue();
    });
  });

  // Review 18.10.: an edit during a run that switches the content type.
  it('an edit to a field of the old type is not kept under the type the answer switched to', async () => {
    (service as any).updateState({
      selectedContentType: 'learning_material.json',
      coreFields: [field('cclom:title', { value: 'Alt', status: FieldStatus.FILLED })],
      specialFields: [field('ccm:oeh_lrt', { value: 'alt', status: FieldStatus.FILLED, schemaName: 'Learning Material' })],
    });
    const pending = deferred<GenerateResponse>();
    generate.and.returnValue(pending.promise);

    const run = service.startExtraction('Seite A');
    await flush();
    service.updateFieldValue('ccm:oeh_lrt', 'neu');
    service.updateFieldValue('cclom:title', 'Mein Titel');
    pending.resolve(response({ 'cclom:title': 'KI-Titel' }, 'event.json'));
    eventFields.resolve([START_DATE]);
    await run;

    const state = service.getCurrentState();
    expect(state.selectedContentType).toBe('event.json');
    expect(state.metadata['ccm:oeh_lrt']).withContext('would be exported under event.json').toBeUndefined();
    expect(state.metadata['cclom:title']).withContext('an edit to a field that stays is kept').toBe('Mein Titel');
  });

  // Review 18.10.: elements with the same instance-id share one state, so they
  // must share what decides about runs too.
  describe('elements that share an instance', () => {
    const ids: string[] = [];
    function bound(id: string, existing?: CanvasService): CanvasService {
      ids.push(id);
      const s = existing ?? create();
      s.bindToInstance(id);
      return s;
    }
    afterEach(() => ids.splice(0).forEach(id => InstanceRegistry.unregister(id, 'none')));

    it('an edit in one element survives the run started in the other', async () => {
      const a = bound('review-shared-edit', service);
      const b = bound('review-shared-edit');
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = a.startExtraction('Seite A');
      await flush();
      b.updateFieldValue('cclom:title', 'Mein Titel');
      pending.resolve(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));
      await run;

      expect(a.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Mein Titel');
    });

    it('a reset in one element supersedes the run started in the other', async () => {
      const a = bound('review-shared-reset', service);
      const b = bound('review-shared-reset');
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = a.startExtraction('Seite A');
      await flush();
      b.reset();
      pending.resolve(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));
      await run;

      const state = b.getCurrentState();
      expect(state.coreFields).toEqual([]);
      expect(state.metadata).withContext('the old page would be exported').toEqual({});
      expect(state.isExtracting).toBeFalse();
    });

    it('a JSON import in one element supersedes the run started in the other', async () => {
      const a = bound('review-shared-import', service);
      const b = bound('review-shared-import');
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = a.startExtraction('Seite A');
      await flush();
      await b.importJsonData({ metadata: { 'cclom:title': 'Importiert' } });
      pending.resolve(response({ 'cclom:title': 'KI-Titel' }, 'core.json'));
      await run;

      expect(b.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Importiert');
    });

    it('a run from before a switch of the instance does not write into the new one', async () => {
      const other = bound('review-rebind-y');
      generate.and.resolveTo(response({ 'cclom:title': 'Titel Y' }, 'core.json'));
      await other.startExtraction('Seite Y'); // instance y has had a run of its own

      const a = bound('review-rebind-x', service);
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);
      const run = a.startExtraction('Seite X');
      await flush();
      bound('review-rebind-y', a);
      pending.resolve(response({ 'cclom:title': 'Titel X' }, 'core.json'));
      await run;

      expect(other.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Titel Y');
    });

    // Release review 18.10. (#23): the run compared against the new scope's
    // number, so the other element of the old instance kept spinning (and its
    // primary stopped sending metadataChange, which waits for !isExtracting).
    it('a run out during a switch of the instance still ends the spinner of the old one', async () => {
      const a = bound('review-23-x', service);
      const b = bound('review-23-x');
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = a.startExtraction('Seite X');
      await flush();
      expect(b.getCurrentState().isExtracting).toBeTrue();
      bound('review-23-y', a);
      pending.resolve(response({ 'cclom:title': 'Titel X' }, 'core.json'));
      await run;

      expect(b.getCurrentState().isExtracting).toBeFalse();
    });
  });

  // Release review 18.10. (#24): the text box is emptied once its text was
  // extracted (U-10). A type choice replaces the text run with a run for the
  // chosen type; its success has to reach the caller of the text run.
  describe('a text run replaced by a type choice', () => {
    beforeEach(() => {
      spyOn(service as any, 'loadSpecialSchema').and.resolveTo();
    });

    async function textRunWithChoice(rerun: () => Promise<GenerateResponse>): Promise<boolean> {
      const pending = deferred<GenerateResponse>();
      generate.and.callFake((req: { schema_file?: string }) =>
        req.schema_file === 'learning_material.json' ? rerun() : pending.promise
      );
      const run = service.startExtraction('Seite A');
      await flush();
      const choice = service.selectContentType('learning_material.json');
      pending.resolve(response({ 'cclom:title': 'Alte Seite' }));
      const [succeeded] = await Promise.all([run, choice]);
      return succeeded;
    }

    it('reports the success of the re-run', async () => {
      const succeeded = await textRunWithChoice(() =>
        Promise.resolve(response({ 'cclom:title': 'Neue Seite' }, 'learning_material.json')));

      expect(succeeded).toBeTrue();
    });

    it('reports a failed re-run as a failure', async () => {
      const succeeded = await textRunWithChoice(() => Promise.reject(new Error('HTTP 502')));

      expect(succeeded).toBeFalse();
    });

    // Follow-up review 18.10.: the first choice ends the spinner before it
    // loads its schema; a second choice in that window did not count as cutting
    // the run short and, on an empty form, re-ran nothing.
    it('two quick choices during one schema load re-run the text for the second type', async () => {
      const slowSchema = deferred<void>();
      (service as any).loadSpecialSchema.and.callFake((file: string) =>
        file === 'a.json' ? slowSchema.promise : Promise.resolve()
      );
      const pending = deferred<GenerateResponse>();
      generate.and.callFake((req: { schema_file?: string }) =>
        req.schema_file === 'b.json'
          ? Promise.resolve(response({ 'cclom:title': 'Neue Seite' }, 'b.json'))
          : pending.promise
      );

      const run = service.startExtraction('Seite A');
      await flush();
      const first = service.selectContentType('a.json');
      const second = service.selectContentType('b.json'); // while a.json loads
      pending.resolve(response({ 'cclom:title': 'Alte Seite' }));
      slowSchema.resolve();
      const [succeeded] = await Promise.all([run, first, second]);

      expect(generate.calls.mostRecent().args[0].schema_file).toBe('b.json');
      expect(service.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')?.value).toBe('Neue Seite');
      expect(succeeded).withContext('the text box is emptied (U-10)').toBeTrue();
    });

    it('a pending re-run is no success of the text run after a reset', async () => {
      const slowSchema = deferred<void>();
      (service as any).loadSpecialSchema.and.callFake(() => slowSchema.promise);
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = service.startExtraction('Seite A');
      await flush();
      const choice = service.selectContentType('a.json');
      service.reset();
      (service as any).updateState({ userText: 'Text nach dem Zurücksetzen' }); // a source of its own
      generate.and.resolveTo(response({ 'cclom:title': 'Andere Seite' }, 'b.json'));
      const other = service.selectContentType('b.json'); // after the reset: not the text run's
      pending.resolve(response({ 'cclom:title': 'Alte Seite' }));
      slowSchema.resolve();
      const [succeeded] = await Promise.all([run, choice, other]);

      expect(succeeded).toBeFalse();
    });

    it('a text run cut short by a reset is no success', async () => {
      const pending = deferred<GenerateResponse>();
      generate.and.returnValue(pending.promise);

      const run = service.startExtraction('Seite A');
      await flush();
      service.reset();
      pending.resolve(response({ 'cclom:title': 'Alte Seite' }, 'core.json'));

      expect(await run).toBeFalse();
    });
  });

  // Release review 18.10. (pre-existing): an edit to one subfield during a run
  // made every subfield of that object the editor's.
  it('a subfield edited during a run is the editor\'s, its siblings keep their origin', async () => {
    const contact = (service as any).applyValueToField(
      field('schema:contactPoint', { datatype: 'array', multiple: true }),
      [{ contactType: 'Besucherservice', email: 'alt@example.org' }],
      true
    ) as CanvasFieldState;
    (service as any).updateState({ coreFields: [contact] });
    const sub = (path: string) => service.getCurrentState().coreFields[0].subFields!.find(sf => sf.path === path)!;
    const pending = deferred<GenerateResponse>();
    generate.and.returnValue(pending.promise);

    const run = service.startExtraction('Seite A');
    await flush();
    service.updateFieldValue(sub('email').fieldId, 'neu@example.org');
    pending.resolve(response({ 'schema:contactPoint': [{ contactType: 'KI', email: 'ki@example.org' }] }, 'core.json'));
    await run;

    expect(sub('email').value).toBe('neu@example.org');
    expect(sub('email').isAiGenerated).toBeFalse();
    expect(sub('contactType').value).toBe('Besucherservice');
    expect(sub('contactType').isAiGenerated).withContext('the editor did not touch it').toBeTrue();
  });

  // Release review 18.10. (pre-existing): an import replaces the form. Without
  // `metadataset` it kept the previous type's fields; without `_source_text`
  // the previous page's text (upload extended_text, source of a re-run) and
  // its preview image (exported as preview_image_url).
  describe('a JSON import replaces what belonged to the previous page', () => {
    beforeEach(() => {
      (service as any).updateState({
        userText: 'Text der vorigen Seite',
        previewImageUrl: 'data:image/png;base64,ALT',
        selectedContentType: 'event.json',
        detectedContentType: 'event.json',
        contentTypeLabel: 'Veranstaltung',
        specialFields: [field('schema:startDate', { value: '2026-05-03', status: FieldStatus.FILLED, schemaName: 'Event' })],
      });
    });

    it('without metadataset: no fields or type of the previous one', async () => {
      await service.importJsonData({ metadata: { 'cclom:title': 'Importiert' } });

      const state = service.getCurrentState();
      expect(state.specialFields).withContext('exported and uploaded with the import').toEqual([]);
      expect(state.selectedContentType).toBeNull();
      expect(state.contentTypeLabel).toBeUndefined();
    });

    it('without _source_text and preview image: neither of the previous page', async () => {
      await service.importJsonData({ metadata: { 'cclom:title': 'Importiert' } });

      const state = service.getCurrentState();
      expect(state.userText).toBe('');
      expect(state.previewImageUrl).toBeUndefined();
    });

    it('with them: the imported ones', async () => {
      await service.importJsonData({
        metadata: { 'cclom:title': 'Importiert' },
        _source_text: 'Importierter Text',
        preview_image_url: 'data:image/png;base64,NEU',
      });

      const state = service.getCurrentState();
      expect(state.userText).toBe('Importierter Text');
      expect(state.previewImageUrl).toBe('data:image/png;base64,NEU');
    });
  });

  // Release review 18.10. (#25): the core fields were read before the special
  // fields of a new type were prepared; labels a language switch relocalized
  // in that window went back to the old language.
  it('labels relocalized while the new type is prepared are kept', async () => {
    generate.and.resolveTo(response({ 'cclom:title': 'Neue Seite' }));

    const run = service.startExtraction('Seite A');
    await flush();
    expect(eventFieldsRequested).withContext('prepareSpecialFields is waiting').toBeTrue();
    const state = service.getCurrentState(); // what relocalizeFields writes meanwhile
    (service as any).updateState({ coreFields: state.coreFields.map(f => ({ ...f, label: 'Title' })) });
    eventFields.resolve([START_DATE]);
    await run;

    const title = service.getCurrentState().coreFields.find(f => f.fieldId === 'cclom:title')!;
    expect(title.label).toBe('Title');
    expect(title.value).toBe('Neue Seite');
  });

  // Review 18.10. (pre-existing): a type chosen during a URL or node-ID run
  // re-ran with `state.userText`, which those runs never set.
  describe('a type chosen during a URL or node-ID run', () => {
    beforeEach(() => {
      spyOn(service as any, 'loadSpecialSchema').and.resolveTo();
    });

    async function chooseTypeDuring(start: () => Promise<unknown>): Promise<any> {
      const pending = deferred<GenerateResponse>();
      generate.and.callFake((req: { schema_file?: string }) =>
        req.schema_file === 'learning_material.json'
          ? Promise.resolve(response({ 'cclom:title': 'Neue Seite' }, 'learning_material.json'))
          : pending.promise
      );
      const run = start();
      await flush();
      const choice = service.selectContentType('learning_material.json');
      pending.resolve(response({ 'cclom:title': 'Alte Seite' }));
      await Promise.all([run, choice]);
      return generate.calls.mostRecent().args[0];
    }

    it('re-runs the URL for the chosen type', async () => {
      const request = await chooseTypeDuring(() => service.startUrlExtraction('https://example.org/b'));

      expect(request.schema_file).toBe('learning_material.json');
      expect(request.input_source).toBe('url');
      expect(request.source_url).toBe('https://example.org/b');
    });

    it('re-runs the node for the chosen type', async () => {
      const request = await chooseTypeDuring(() => service.startNodeIdExtraction('node-7'));

      expect(request.schema_file).toBe('learning_material.json');
      expect(request.input_source).toBe('node_id');
      expect(request.node_id).toBe('node-7');
    });

    it('does not re-run with the text of the previous page', async () => {
      (service as any).updateState({ userText: 'Text der vorigen Seite' });

      const request = await chooseTypeDuring(() => service.startUrlExtraction('https://example.org/b'));

      expect(request.text).not.toBe('Text der vorigen Seite');
      expect(request.source_url).toBe('https://example.org/b');
    });
  });

  // Release review 18.10. (M4): the values cached per content type outlived the
  // page they belong to. A type choice brought back the special fields of an
  // earlier page (exported and uploaded with the new one) and, because the
  // type counted as "cached", cut a running extraction short without re-running it.
  describe('values cached per content type', () => {
    const TYPE_FIELD: Record<string, string> = { 'a.json': 'ccm:a', 'b.json': 'ccm:b' };

    beforeEach(() => {
      spyOn(service as any, 'loadSpecialSchema').and.callFake(async (file: string) => {
        (service as any).updateState({ specialFields: [field(TYPE_FIELD[file], { schemaName: file })] });
      });
    });

    /** Page 1 has type A with a value; switching to B caches it. */
    async function pageOneWithTypeACached(): Promise<void> {
      (service as any).updateState({
        selectedContentType: 'a.json',
        specialFields: [field('ccm:a', { value: 'Seite 1', status: FieldStatus.FILLED, schemaName: 'a.json' })],
      });
      await service.selectContentType('b.json');
    }

    function valueOfA(): unknown {
      return service.getCurrentState().specialFields.find(f => f.fieldId === 'ccm:a')?.value;
    }

    it('a reset forgets them', async () => {
      await pageOneWithTypeACached();

      service.reset();
      await service.selectContentType('a.json');

      expect(valueOfA()).toBeNull();
      expect(service.getCurrentState().metadata['ccm:a']).withContext('would be uploaded').toBeUndefined();
    });

    it('a type chosen during the next page\'s run after a reset re-runs that page', async () => {
      await pageOneWithTypeACached();
      service.reset(); // also what plugin-extract { reset: true } does
      const pending = deferred<GenerateResponse>();
      generate.and.callFake((req: { schema_file?: string }) =>
        req.schema_file === 'a.json'
          ? Promise.resolve(response({ 'cclom:title': 'Seite 2', 'ccm:a': 'Seite 2' }, 'a.json'))
          : pending.promise
      );

      const run = service.startUrlExtraction('https://example.org/seite-2');
      await flush();
      const choice = service.selectContentType('a.json');
      pending.resolve(response({ 'cclom:title': 'Alte Antwort' }));
      await Promise.all([run, choice]);

      const request = generate.calls.mostRecent().args[0];
      expect(request.schema_file).toBe('a.json');
      expect(request.source_url).toBe('https://example.org/seite-2');
      expect(valueOfA()).toBe('Seite 2');
      expect(service.getCurrentState().isExtracting).toBeFalse();
    });

    it('loading other metadata forgets them', async () => {
      await pageOneWithTypeACached();

      await service.importJsonData({ metadataset: 'b.json', metadata: { 'ccm:b': 'Import' } });
      await service.selectContentType('a.json');

      expect(valueOfA()).toBeNull();
    });

    it('a new extraction forgets them', async () => {
      await pageOneWithTypeACached();
      generate.and.callFake((req: { schema_file?: string }) =>
        Promise.resolve(req.schema_file === 'a.json'
          ? response({ 'cclom:title': 'Seite 2', 'ccm:a': 'Seite 2 als A' }, 'a.json')
          : response({ 'cclom:title': 'Seite 2', 'ccm:b': 'Seite 2' }, 'b.json'))
      );

      await service.startExtraction('Text von Seite 2');
      await service.selectContentType('a.json');

      expect(generate.calls.mostRecent().args[0].schema_file).withContext('page 2 is extracted for A').toBe('a.json');
      expect(valueOfA()).toBe('Seite 2 als A');
    });

    // Follow-up review 18.10.: the forced re-run sent only the core values;
    // the cached special fields of the type (here the editor's) were lost.
    it('switching back to a cached type during a re-run sends its cached values with their origin', async () => {
      (service as any).updateState({
        selectedContentType: 'a.json',
        specialFields: [field('ccm:a', { value: 'Mein Wert', status: FieldStatus.FILLED, isAiGenerated: false, schemaName: 'a.json' })],
      });
      // The page run and the re-run for B stay out; the re-run for A answers.
      const pending = deferred<GenerateResponse>();
      generate.and.returnValues(
        pending.promise,
        pending.promise,
        Promise.resolve(response({ 'cclom:title': 'Seite 2', 'ccm:a': 'Mein Wert' }, 'a.json')),
      );

      const run = service.startUrlExtraction('https://example.org/seite-2');
      await flush();
      const toB = service.selectContentType('b.json'); // caches A
      await flush();
      const toA = service.selectContentType('a.json');
      pending.resolve(response({ 'cclom:title': 'Alte Antwort' }));
      await Promise.all([run, toB, toA]);

      expect(generate).toHaveBeenCalledTimes(3);
      const request = generate.calls.mostRecent().args[0];
      expect(request.schema_file).toBe('a.json');
      expect(request.existing_metadata?.['ccm:a']).toBe('Mein Wert');
      expect(request.existing_metadata?.['_origins']?.['ccm:a']).toBe('user');
    });

    it('a type choice that cuts a run short re-runs it even when that type is cached', async () => {
      // Page 1 had type A; page 2 starts, B is chosen during it (caching A),
      // then A again while the re-run for B is still out.
      (service as any).updateState({
        selectedContentType: 'a.json',
        specialFields: [field('ccm:a', { value: 'Seite 1', status: FieldStatus.FILLED, schemaName: 'a.json' })],
      });
      const pending = deferred<GenerateResponse>();
      generate.and.callFake((req: { schema_file?: string }) =>
        req.schema_file === 'a.json'
          ? Promise.resolve(response({ 'cclom:title': 'Seite 2', 'ccm:a': 'Seite 2' }, 'a.json'))
          : pending.promise
      );

      const run = service.startUrlExtraction('https://example.org/seite-2');
      await flush();
      const toB = service.selectContentType('b.json');
      await flush();
      const toA = service.selectContentType('a.json');
      pending.resolve(response({ 'cclom:title': 'Alte Antwort' }));
      await Promise.all([run, toB, toA]);

      const request = generate.calls.mostRecent().args[0];
      expect(request.schema_file).toBe('a.json');
      expect(request.source_url).toBe('https://example.org/seite-2');
      expect(valueOfA()).toBe('Seite 2');
      expect(service.getCurrentState().isExtracting).toBeFalse();
    });
  });
});
