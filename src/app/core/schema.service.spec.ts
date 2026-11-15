/**
 * A content-type schema that cannot be loaded is a failure, not an empty type.
 *
 * It used to come back as [] — truthy, so the canvas built the type with no
 * fields of its own and said nothing. The empty result was cached as well, so
 * the type stayed empty until the page was reloaded.
 */

import { SchemaService } from './schema.service';
import { WidgetDebug } from './debug';

/**
 * Review 18.10.: a core schema requested before the widget had set its
 * context fell back to 'default' and could overwrite the configured
 * context-name (e.g. mds_oeh) that was being set at the same moment.
 */
describe('SchemaService.loadCoreSchema during startup', () => {
  function service(getSchema: jasmine.Spy): SchemaService {
    const config = { debug: () => {}, error: () => {}, info: () => {} };
    return new SchemaService(config as any, {} as any, { getSchema } as any);
  }

  it('waits for the context that is being set instead of falling back to default', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.resolveTo({ fields: [], groups: [] });
    const schemas = service(getSchema);

    const early = schemas.loadCoreSchema(); // e.g. metadata-input before ngOnInit
    const context = schemas.setContext('mds_oeh', 'latest');
    const late = schemas.loadCoreSchema();
    await Promise.all([early, context, late]);

    expect(schemas.getContextName()).toBe('mds_oeh');
    expect(getSchema.calls.allArgs()).toEqual([['mds_oeh', 'latest', 'core.json']]);
  });

  it('asks once for the core schema while a request for it is out', async () => {
    let answer!: (value: unknown) => void;
    const getSchema = jasmine.createSpy('getSchema').and.returnValue(new Promise(resolve => (answer = resolve)));
    const schemas = service(getSchema);
    await schemas.setContext('mds_oeh', 'latest');

    const first = schemas.loadCoreSchema();
    const second = schemas.loadCoreSchema();
    await Promise.resolve();
    await Promise.resolve();
    answer({ fields: [{ id: 'cclom:title' }], groups: [] });

    expect((await first).fields).toEqual((await second).fields);
    expect(getSchema).toHaveBeenCalledTimes(1);
  });

  // Release review 18.10. (pre-existing): the groups of a content type were
  // kept across a context switch, the fields were not.
  it('asks the new context for the groups of a content type after a switch', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.callFake(async (context: string) => ({
      fields: [], groups: [{ id: `${context}-group` }],
    }));
    const schemas = service(getSchema);
    await schemas.setContext('default', 'latest');
    await schemas.loadContentTypeSchema('event.json');

    await schemas.setContext('mds_oeh', 'latest');
    const groups = await schemas.getGroups('event.json');

    expect(groups).toEqual([{ id: 'mds_oeh-group' }]);
  });

  // Review 18.10.: every widget on the page sets the context in ngOnInit. A
  // second widget (or a re-attached one) emptied the schemas the first one
  // still exports from.
  it('keeps the loaded schemas when the same context is set again', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.resolveTo({ fields: [{ id: 'cclom:title' }], groups: [] });
    const schemas = service(getSchema);
    await schemas.setContext('default', 'latest');
    await schemas.loadCoreSchema();
    await schemas.loadContentTypeSchema('event.json');

    await schemas.setContext('default');
    await schemas.loadCoreSchema();
    await schemas.loadContentTypeSchema('event.json');

    expect(getSchema).toHaveBeenCalledTimes(2);
    expect(schemas.getFieldById('cclom:title')).toBeDefined();
  });

  it('still defaults to the default context when none is set', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.resolveTo({ fields: [], groups: [] });
    const schemas = service(getSchema);

    await schemas.loadCoreSchema();

    expect(getSchema.calls.mostRecent().args[0]).toBe('default');
  });
});

describe('SchemaService.loadContentTypeSchema', () => {
  function service(getSchema: jasmine.Spy): SchemaService {
    const config = { debug: () => {}, error: () => {} };
    return new SchemaService(config as any, {} as any, { getSchema } as any);
  }

  it('reports a schema that could not be loaded', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.rejectWith(new Error('502'));

    await expectAsync(service(getSchema).loadContentTypeSchema('event.json')).toBeRejected();
  });

  it('tries again next time instead of keeping the failure', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.returnValues(
      Promise.reject(new Error('502')),
      Promise.resolve({ fields: [{ id: 'schema:startDate' }] }),
    );
    const schemas = service(getSchema);

    await expectAsync(schemas.loadContentTypeSchema('event.json')).toBeRejected();
    const fields = await schemas.loadContentTypeSchema('event.json');

    expect(fields.map(f => f.id)).toEqual(['schema:startDate']);
  });
});

/**
 * Audit 14.11. (W-N): a 200 that is no schema - another service behind the
 * address, a proxy's JSON page - ended in "Cannot read properties of
 * undefined (reading 'length')".
 */
describe('SchemaService and an answer that is no schema', () => {
  const NOT_A_SCHEMA: unknown[] = [{}, { detail: 'Not Found' }, { fields: 'none' }, null, 'ok', []];

  function service(answer: unknown, instant = (key: string) => key): SchemaService {
    const config = { debug: () => {}, error: () => {}, info: () => {} };
    return new SchemaService(config as any, { instant } as any, { getSchema: () => Promise.resolve(answer) } as any);
  }

  for (const answer of NOT_A_SCHEMA) {
    it(`fails readably for the core schema (${JSON.stringify(answer)})`, async () => {
      await expectAsync(service(answer).loadCoreSchema())
        .toBeRejectedWithError(/not a result of the metadata agent.*api-url/);
    });

    it(`fails readably for a content-type schema (${JSON.stringify(answer)})`, async () => {
      await expectAsync(service(answer).loadContentTypeSchema('event.json'))
        .toBeRejectedWithError(/not a result of the metadata agent/);
    });
  }

  it('says so in the language of the widget', async () => {
    const german = (key: string) => (key === 'ALERTS.ANSWER_UNREADABLE' ? 'Die Antwort ist kein Ergebnis des Metadaten-Agenten.' : key);

    await expectAsync(service({}, german).loadCoreSchema())
      .toBeRejectedWithError('Die Antwort ist kein Ergebnis des Metadaten-Agenten.');
  });

  it('asks again next time: nothing of the answer is kept', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.returnValues(
      Promise.resolve({ detail: 'Not Found' }),
      Promise.resolve({ fields: [{ id: 'cclom:title' }], groups: [] }),
    );
    const schemas = new SchemaService({ debug: () => {}, error: () => {} } as any, { instant: (key: string) => key } as any, { getSchema } as any);

    await expectAsync(schemas.loadCoreSchema()).toBeRejected();

    expect((await schemas.loadCoreSchema()).fields.map(f => f.id)).toEqual(['cclom:title']);
  });

  it('takes a schema without fields of its own for what it is: an empty list', async () => {
    expect((await service({ fields: [] }).loadCoreSchema()).fields).toEqual([]);
  });
});

/**
 * Audit 14.11. (W-N): the groups asked for on their own (getGroups) were
 * cached without the check the fields have - a context switch while the
 * request was out stored the old context's groups under the new one.
 */
describe('SchemaService.getGroups across a context switch', () => {
  it('does not keep groups of the previous context that answered after the switch', async () => {
    let answerDefault!: (value: unknown) => void;
    const getSchema = jasmine.createSpy('getSchema').and.callFake((context: string) =>
      context === 'default'
        ? new Promise(resolve => (answerDefault = resolve))
        : Promise.resolve({ fields: [], groups: [{ id: 'mds-group' }] }));
    const schemas = new SchemaService({ debug: () => {}, error: () => {}, info: () => {} } as any, {} as any, { getSchema } as any);
    await schemas.setContext('default', 'latest');

    const stale = schemas.getGroups('event.json');
    await schemas.setContext('mds_oeh', 'latest');
    answerDefault({ fields: [], groups: [{ id: 'default-group' }] });
    expect(await stale).withContext('the caller that asked gets its answer').toEqual([{ id: 'default-group' }]);

    expect(await schemas.getGroups('event.json')).toEqual([{ id: 'mds-group' }]);
  });

  it('keeps the groups of the current context: asked once', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.resolveTo({ fields: [], groups: [{ id: 'g' }] });
    const schemas = new SchemaService({ debug: () => {}, error: () => {}, info: () => {} } as any, {} as any, { getSchema } as any);
    await schemas.setContext('default', 'latest');

    await schemas.getGroups('event.json');
    await schemas.getGroups('event.json');

    expect(getSchema).toHaveBeenCalledTimes(1);
  });
});

/** Final audit 18.10. (L-11). */
describe('SchemaService content-type schemas', () => {
  function service(getSchema: jasmine.Spy): SchemaService {
    const config = { debug: () => {}, error: () => {}, info: () => {} };
    return new SchemaService(config as any, {} as any, { getSchema } as any);
  }

  it('asks once for a content-type schema while a request for it is out', async () => {
    let answer!: (value: unknown) => void;
    const getSchema = jasmine.createSpy('getSchema').and.returnValue(new Promise(resolve => (answer = resolve)));
    const schemas = service(getSchema);
    await schemas.setContext('default', 'latest');

    const first = schemas.loadContentTypeSchema('event.json');
    const second = schemas.loadContentTypeSchema('event.json');
    answer({ fields: [{ id: 'schema:startDate' }], groups: [] });

    expect(await first).toEqual(await second);
    expect(getSchema).toHaveBeenCalledTimes(1);
  });

  it('does not keep a schema of the previous context that answered after a switch', async () => {
    let answerDefault!: (value: unknown) => void;
    const getSchema = jasmine.createSpy('getSchema').and.callFake((context: string) =>
      context === 'default'
        ? new Promise(resolve => (answerDefault = resolve))
        : Promise.resolve({ fields: [{ id: 'mds-field' }], groups: [] }));
    const schemas = service(getSchema);
    await schemas.setContext('default', 'latest');

    const stale = schemas.loadContentTypeSchema('event.json');
    await schemas.setContext('mds_oeh', 'latest');
    answerDefault({ fields: [{ id: 'default-field' }], groups: [] });
    await stale;

    const fields = await schemas.loadContentTypeSchema('event.json');
    expect(fields.map(f => f.id)).toEqual(['mds-field']);
  });

  it('finds a field in the schema it is asked for, not in the first one that has the id', async () => {
    const getSchema = jasmine.createSpy('getSchema').and.callFake(async (_c: string, _v: string, file: string) => ({
      fields: [{ id: 'schema:location', system: { datatype: file === 'event.json' ? 'array' : 'string' } }],
      groups: [],
    }));
    const schemas = service(getSchema);
    await schemas.setContext('default', 'latest');
    await schemas.loadContentTypeSchema('event.json');
    await schemas.loadContentTypeSchema('organization.json');

    expect(schemas.getFieldById('schema:location', 'organization.json')?.system?.datatype).toBe('string');
    expect(schemas.getFieldById('schema:location', 'event.json')?.system?.datatype).toBe('array');
  });
});

/**
 * Audit 13.11. (W-ARCH-01): every start wrote "Context set: …" into the
 * console of the host page. Only with the widget's debug switch now.
 */
describe('SchemaService console output', () => {
  let info: jasmine.Spy;
  let schemas: SchemaService;

  beforeEach(() => {
    info = jasmine.createSpy('config.info');
    schemas = new SchemaService({ debug: () => {}, error: () => {}, info } as any, {} as any, {} as any);
  });
  afterEach(() => (WidgetDebug.enabled = false));

  it('says nothing about the context in the host page\'s console', async () => {
    await schemas.setContext('mds_oeh', 'latest');

    expect(info).not.toHaveBeenCalled();
  });

  it('names the context with debug switched on', async () => {
    WidgetDebug.enabled = true;

    await schemas.setContext('mds_oeh', 'latest');

    expect(info).toHaveBeenCalledWith('Context set: mds_oeh vlatest');
  });
});
