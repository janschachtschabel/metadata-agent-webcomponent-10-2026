/**
 * A content-type schema that cannot be loaded is a failure, not an empty type.
 *
 * It used to come back as [] — truthy, so the canvas built the type with no
 * fields of its own and said nothing. The empty result was cached as well, so
 * the type stayed empty until the page was reloaded.
 */

import { SchemaService } from './schema.service';

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
