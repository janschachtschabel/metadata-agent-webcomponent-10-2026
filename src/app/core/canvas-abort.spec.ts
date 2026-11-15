/**
 * Audit 13.11. (W-PERF-01): a run that a reset, an import or a type choice
 * replaced only had its answer dropped - the request stayed out, for up to
 * 300 s on the agent. Three type choices in a row meant four AI runs at once.
 * Each run now has its AbortController; whatever takes over aborts it.
 *
 * Real CanvasService and SchemaService; only the HTTP answers are faked.
 */
import { Subject } from 'rxjs';

import { ApiService } from './api.service';
import { CanvasService } from './canvas.service';
import { InstanceRegistry } from './instance-registry';
import { SchemaService } from './schema.service';
import { ShapeExpanderService } from './shape-expander.service';

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
            { uri: 'http://w3id.org/a', label: { de: 'A' }, schema_file: 'a.json' },
            { uri: 'http://w3id.org/b', label: { de: 'B' }, schema_file: 'b.json' },
          ],
        },
      },
    },
  ],
  groups: [],
};
const TYPE = { fields: [{ id: 'ccm:a', label: { de: 'Feld' }, system: { datatype: 'string' } }], groups: [] };

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve));
}

describe('CanvasService aborts the run it replaces (W-PERF-01)', () => {
  let service: CanvasService;
  let signals: AbortSignal[];
  let error: jasmine.Spy;
  let create: () => CanvasService;

  beforeEach(() => {
    signals = [];
    error = jasmine.createSpy('logger.error');
    const i18n = { currentLang: 'de', instant: (key: string) => key };
    const quiet = { info: () => {}, warn: () => {}, error, debug: () => {}, group: () => {}, groupEnd: () => {} };
    const api = {
      getSchema: (_c: string, _v: string, file: string) => Promise.resolve(file === 'core.json' ? CORE : TYPE),
      // Like HttpClient: out until it is aborted, then it fails.
      generate: (_request: unknown, signal: AbortSignal) => {
        signals.push(signal);
        return new Promise((_resolve, reject) =>
          signal?.addEventListener('abort', () => reject(new Error('request aborted'))));
      },
    };
    const schema = new SchemaService(quiet as any, i18n as any, api as any);
    create = () => new CanvasService(schema, api as any, i18n as any, quiet as any, new ShapeExpanderService(schema), { run: (fn: () => unknown) => fn() } as any);
    service = create();
  });

  /** Starts an extraction and returns once its request is out; `done` settles when the run ends. */
  async function running(text = 'Seite A'): Promise<{ done: Promise<boolean> }> {
    const done = service.startExtraction(text);
    await flush();
    return { done };
  }

  it('hands each run a signal that stays quiet while the run is the current one', async () => {
    await running();

    expect(signals.length).toBe(1);
    expect(signals[0].aborted).toBeFalse();
    expect(service.getCurrentState().isExtracting).toBeTrue();
  });

  it('a reset aborts the run and shows no error', async () => {
    const run = await running();

    service.reset();
    await run.done;

    expect(signals[0].aborted).toBeTrue();
    expect(service.getCurrentState().extractionError).toBeNull();
    expect(service.getCurrentState().isExtracting).toBeFalse();
    expect(error).not.toHaveBeenCalled();
  });

  // Audit 14.11. (K-23): the editor could not stop a run - only a reset did,
  // and that empties the form.
  it('cancelling aborts the run, shows no error and keeps the form', async () => {
    await service.importJsonData({ metadata: { 'cclom:title': 'Bleibt' } });
    const run = await running();

    service.cancelExtraction();
    await run.done;

    expect(signals[0].aborted).toBeTrue();
    expect(service.getCurrentState().isExtracting).toBeFalse();
    expect(service.getCurrentState().extractionError).toBeNull();
    expect(service.getMetadataForExport()['metadata']['cclom:title']).toBe('Bleibt');
    expect(error).not.toHaveBeenCalled();
  });

  it('cancelling without a run changes nothing', async () => {
    await service.importJsonData({ metadata: { 'cclom:title': 'Bleibt' } });
    const before = service.getCurrentState();

    service.cancelExtraction();

    expect(service.getCurrentState()).toBe(before);
  });

  it('a new extraction aborts the one before it', async () => {
    const first = await running('Seite A');

    await running('Seite B');
    await first.done;

    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    expect(service.getCurrentState().extractionError).toBeNull();
    expect(service.getCurrentState().isExtracting).withContext('the second run is out').toBeTrue();
  });

  it('an import aborts the run', async () => {
    const run = await running();

    await service.importJsonData({ metadata: { 'cclom:title': 'Importiert' } });
    await run.done;

    expect(signals[0].aborted).toBeTrue();
    expect(service.getCurrentState().extractionError).toBeNull();
    expect(service.getCurrentState().isExtracting).toBeFalse();
  });

  it('type choices in a row leave one request out, not one each', async () => {
    await running();

    void service.selectContentType('a.json');
    await flush();
    void service.selectContentType('b.json');
    await flush();

    expect(signals.length).toBe(3);
    expect(signals.map(signal => signal.aborted)).toEqual([true, true, false]);
    expect(service.getCurrentState().extractionError).toBeNull();
  });

  describe('when its element goes away', () => {
    it('the run of an instance nobody is left in is aborted, without an error', async () => {
      service.bindToInstance('abort-last');
      InstanceRegistry.register('abort-last', 'element-1');
      const run = await running();

      InstanceRegistry.unregister('abort-last', 'element-1');
      await run.done;

      expect(signals[0].aborted).toBeTrue();
      expect(service.getCurrentState().extractionError).toBeNull();
      expect(error).not.toHaveBeenCalled();
    });

    it('the run goes on while another element shows the same instance', async () => {
      service.bindToInstance('abort-shared');
      InstanceRegistry.register('abort-shared', 'element-1');
      InstanceRegistry.register('abort-shared', 'element-2');
      await running();

      InstanceRegistry.unregister('abort-shared', 'element-1');
      await flush();

      expect(signals[0].aborted).toBeFalse();
      InstanceRegistry.unregister('abort-shared', 'element-2');
    });
  });
});

describe('ApiService.generate with an abort signal (W-PERF-01)', () => {
  /** An ApiService whose POST answers when `answer` does; unsubscribing from it is what cancels a request. */
  function apiWith(answer: Subject<unknown>) {
    const error = jasmine.createSpy('logger.error');
    const logger = { info: () => {}, warn: () => {}, error, debug: () => {} } as any;
    return { api: new ApiService({ post: () => answer } as any, logger), error };
  }

  it('lets go of the request and fails without logging an error', async () => {
    const answer = new Subject<unknown>();
    const { api, error } = apiWith(answer);
    const abort = new AbortController();

    const pending = api.generate({ text: 'Ein Text' }, abort.signal);
    expect(answer.observed).withContext('request is out').toBeTrue();
    abort.abort();

    await expectAsync(pending).toBeRejected();
    expect(answer.observed).withContext('unsubscribing cancels the HTTP request').toBeFalse();
    expect(error).not.toHaveBeenCalled();
  });

  it('answers as before while nobody aborts', async () => {
    const answer = new Subject<unknown>();
    const { api } = apiWith(answer);

    const pending = api.generate({ text: 'Ein Text' }, new AbortController().signal);
    answer.next({ metadataset: 'event.json', 'cclom:title': 'Konzert', processing: { status: 'success' } });
    answer.complete();

    expect((await pending).metadata).toEqual({ 'cclom:title': 'Konzert' });
  });

  it('fails at once for a signal that is aborted already', async () => {
    const answer = new Subject<unknown>();
    const { api } = apiWith(answer);
    const abort = new AbortController();
    abort.abort();

    await expectAsync(api.generate({ text: 'Ein Text' }, abort.signal)).toBeRejected();
    expect(answer.observed).toBeFalse();
  });
});
