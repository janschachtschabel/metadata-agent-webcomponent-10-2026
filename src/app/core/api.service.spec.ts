/**
 * The API boundary must not throw on a body it cannot use.
 *
 * A proxy in front can answer 200 with an empty body. `generate()` used to run
 * `Object.entries(null)` and read `processing.fields_extracted` unguarded, so
 * the editor saw "Cannot convert undefined or null to object" instead of the
 * canvas's own message about an unusable answer.
 */

import { of } from 'rxjs';

import { ApiService } from './api.service';

function apiAnswering(body: unknown): ApiService {
  const http = { post: () => of(body) } as any;
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
  return new ApiService(http, logger);
}

describe('ApiService.generate', () => {
  it('hands an empty 200 on to the canvas instead of throwing', async () => {
    const response = await apiAnswering(null).generate({ text: 'Ein Text' } as any);

    expect(response.processing).toBeUndefined();
    expect(response.metadata).toEqual({});
  });

  it('splits a normal answer into metadata and processing', async () => {
    const response = await apiAnswering({
      contextName: 'default',
      metadataset: 'event.json',
      'cclom:title': 'Konzert in Weimar',
      processing: { status: 'success', fields_extracted: 1, fields_total: 1 },
    }).generate({ text: 'Ein Text' } as any);

    expect(response.metadata).toEqual({ 'cclom:title': 'Konzert in Weimar' });
    expect(response.processing.status).toBe('success');
  });
});

/** Final audit 18.10. (S-2): host-set context/version went into the path unescaped. */
describe('ApiService.getSchema', () => {
  it('escapes context, version and file name in the path', async () => {
    const get = jasmine.createSpy('get').and.returnValue(of({ fields: [] }));
    const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
    const api = new ApiService({ get } as any, logger);
    api.setApiUrl('https://agent.example');

    await api.getSchema('../admin?x=1', 'v1#2', 'event.json');

    expect(get.calls.mostRecent().args[0])
      .toBe('https://agent.example/info/schema/..%2Fadmin%3Fx%3D1/v1%232/event.json');
  });
});
