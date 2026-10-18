/**
 * A content-type schema that cannot be loaded is a failure, not an empty type.
 *
 * It used to come back as [] — truthy, so the canvas built the type with no
 * fields of its own and said nothing. The empty result was cached as well, so
 * the type stayed empty until the page was reloaded.
 */

import { SchemaService } from './schema.service';

/**
 * Review 18.10.: a core schema requested before the widget had set its
 * context fell back to 'default' and could overwrite the configured
 * context-name (e.g. mds_oeh) that was being set at the same moment.
 */
describe('SchemaService.loadCoreSchema during startup', () => {
  function service(getSchema: jasmine.Spy): SchemaService {
    const config = { debug: () => {}, error: () => {}, info: () => {} };
    return new SchemaService({} as any, config as any, {} as any, { getSchema } as any);
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
    return new SchemaService({} as any, config as any, {} as any, { getSchema } as any);
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
