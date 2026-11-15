/**
 * The API boundary must not throw on a body it cannot use.
 *
 * A proxy in front can answer 200 with an empty body. `generate()` used to run
 * `Object.entries(null)` and read `processing.fields_extracted` unguarded, so
 * the editor saw "Cannot convert undefined or null to object" instead of the
 * canvas's own message about an unusable answer.
 */

import { Observable, of } from 'rxjs';

import { ApiService, REQUEST_TIMEOUT_MS } from './api.service';

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

/**
 * Audit 14.11. (W-50): no call had a time limit. Behind a proxy that keeps the
 * connection open, a schema never came and a hanging /upload held its button
 * for good.
 */
describe('ApiService time limits', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
  /** An agent that never answers; counts how often a request was given up. */
  function silentAgent(): { api: ApiService; givenUp: () => number } {
    let unsubscribed = 0;
    const never = () => new Observable(() => () => unsubscribed++);
    return { api: new ApiService({ get: never, post: never } as any, logger), givenUp: () => unsubscribed };
  }

  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  async function outcomeAfter(call: Promise<unknown>, ms: number): Promise<string> {
    let outcome = 'waiting';
    call.then(() => (outcome = 'answered'), error => (outcome = error?.name));
    jasmine.clock().tick(ms);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    return outcome;
  }

  it('gives a schema 30 s', async () => {
    const { api, givenUp } = silentAgent();
    const call = api.getSchema('default', 'latest', 'core.json');

    expect(await outcomeAfter(call, 29_999)).toBe('waiting');
    expect(await outcomeAfter(call, 2)).toBe('TimeoutError');
    expect(givenUp()).withContext('the request is cancelled').toBe(1);
  });

  it('gives an upload 130 s - longer than the agent takes to give up itself (100 s)', async () => {
    const { api } = silentAgent();
    const call = api.upload({ metadata: {} });

    expect(await outcomeAfter(call, 129_999)).toBe('waiting');
    expect(await outcomeAfter(call, 2)).toBe('TimeoutError');
  });

  it('gives a generation 330 s - longer than the agent\'s own limit (300 s)', async () => {
    const { api } = silentAgent();
    const call = api.generate({ text: 'Ein Text' });

    expect(await outcomeAfter(call, 329_999)).toBe('waiting');
    expect(await outcomeAfter(call, 2)).toBe('TimeoutError');
  });

  it('names its limits', () => {
    expect(REQUEST_TIMEOUT_MS).toEqual({ schema: 30_000, upload: 130_000, generate: 330_000 });
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
