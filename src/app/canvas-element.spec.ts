/**
 * The widget as a host page gets it: the custom element, built as src/main.ts
 * builds it (audit 14.11., U-08, K-26). Every other spec drives the component
 * through a fixture; none of them saw what Angular Elements does between the
 * host and the component:
 *
 * (a) the component is destroyed 10 ms after the element left the document,
 *     and the new one started without the host's inputs (W-38);
 * (b) a value equal to the one before is dropped (`autoExtract = true` twice);
 * (c) reading a property back gave undefined;
 * (d) a removed attribute arrives as null, which counted as false; a bare
 *     `readonly` arrived as '' and counted as false, too (W-46).
 *
 * Real timers on purpose: the 10 ms are Angular's, and the order of setters,
 * ngOnChanges and change detection is what is under test.
 */
import { Injector, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { createCanvasElement } from './canvas-element';
import { DEFAULT_SCHEMAS, EVENT_URI, FakeApi, configureCanvasTestBed, generated, typeAndLeave } from './testing/canvas-harness';

type CanvasElement = HTMLElement & Record<string, any>;

const RECORD = { metadataset: 'event.json', metadata: { 'cclom:title': 'Sommerkonzert', 'schema:startDate': '2026-05-03' } };
const INPUT_AREA = '.input-section, .input-area';

const wait = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

let defined = 0;

describe('<metadata-agent-canvas>: the custom element', () => {
  let api: FakeApi;
  let tag: string;
  let host: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection({ eventCoalescing: true })] });
    api = await configureCanvasTestBed(DEFAULT_SCHEMAS);
    // As in main.ts; under a tag of its own, since a definition cannot be undone.
    tag = `metadata-agent-canvas-spec-${++defined}`;
    customElements.define(tag, createCanvasElement(TestBed.inject(Injector)));
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(async () => {
    host.remove();
    await wait(); // Angular destroys the components 10 ms after they left
  });

  /** A new element with its own instance; not in the document yet. */
  function create(properties: Record<string, unknown> = {}): CanvasElement {
    const element = document.createElement(tag) as CanvasElement;
    element['instanceId'] = `${tag}-${Math.random()}`;
    Object.assign(element, properties);
    return element;
  }

  function field(element: HTMLElement, label: string): Element {
    const found = Array.from(element.querySelectorAll('app-field'))
      .find(el => el.querySelector('mat-label, .readonly-label')?.textContent?.trim().startsWith(label));
    if (!found) throw new Error(`no field labelled "${label}"`);
    return found;
  }

  function control(element: HTMLElement, label: string): HTMLInputElement | HTMLTextAreaElement {
    return field(element, label).querySelector('textarea[matInput], input[matInput]') as HTMLInputElement | HTMLTextAreaElement;
  }

  /** A read-only view shows the value as text and has no control (audit 14.11., U-02); null in an editable one. */
  function readonlyText(element: HTMLElement, label: string): string | null {
    const shown = field(element, label);
    return shown.querySelector('input, textarea') ? null : shown.querySelector('.readonly-value')?.textContent?.trim() ?? null;
  }

  function records(element: HTMLElement, event = 'metadataChange'): Record<string, any>[] {
    const seen: Record<string, any>[] = [];
    element.addEventListener(event, e => seen.push((e as CustomEvent).detail));
    return seen;
  }

  describe('configured before it is in the document', () => {
    it('never draws the input area of the default layout when properties say otherwise', async () => {
      const element = create({ layout: 'clean', showFloatingControls: false, metadataInput: RECORD });
      const drawn: Element[] = [];
      const observer = new MutationObserver(mutations => {
        for (const node of mutations.flatMap(mutation => Array.from(mutation.addedNodes))) {
          if (!(node instanceof Element)) continue;
          if (node.matches(INPUT_AREA)) drawn.push(node);
          drawn.push(...Array.from(node.querySelectorAll(INPUT_AREA)));
        }
      });
      observer.observe(element, { childList: true, subtree: true });

      host.appendChild(element);
      await wait(100);
      observer.disconnect();

      expect(drawn).withContext('input area nodes that entered the element').toEqual([]);
      expect(element.querySelector('app-clean-layout')).not.toBeNull();
      expect(control(element, 'Titel').value).toBe('Sommerkonzert');
    });

    it('takes its configuration from attributes alone', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-attributes" layout="detail" show-status-bar="true"
        content-type="${EVENT_URI}"
        metadata-input='${JSON.stringify({ 'cclom:title': 'Aus dem Attribut', 'schema:startDate': '2026-05-03' })}'></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      await wait(100);

      expect(element.querySelector('app-detail-layout')).not.toBeNull();
      expect(element.querySelector(INPUT_AREA)).toBeNull();
      expect(readonlyText(element, 'Titel')).withContext('detail is a read-only layout').toBe('Aus dem Attribut');
      expect(field(element, 'Beginn')).withContext('the type of the content-type attribute').toBeTruthy();
    });

    it('imports the first record after all first inputs, whatever their order', async () => {
      // metadata-input before api-url and instance-id: the import must not
      // start in the default instance or against the default address.
      const element = document.createElement(tag) as CanvasElement;
      element['metadataInput'] = RECORD;
      element['contentType'] = 'person.json';
      element['instanceId'] = `${tag}-late-instance`;
      const seen = records(element);
      host.appendChild(element);
      await wait(150);

      expect(control(element, 'Titel').value).toBe('Sommerkonzert');
      expect(api.getSchema.calls.allArgs().map(args => args[2])).toContain('person.json');
      expect(seen[seen.length - 1]['metadataset'])
        .withContext('the type the host set is applied after the import (F1)').toBe('person.json');
    });
  });

  it('takes properties that arrive 150 ms after it was drawn', async () => {
    const element = create();
    host.appendChild(element);
    await wait(150);
    expect(element.querySelector('app-default-layout')).not.toBeNull();
    expect(element.querySelector(INPUT_AREA)).not.toBeNull();

    Object.assign(element, { layout: 'clean', metadataInput: RECORD });
    await wait(100);

    expect(element.querySelector('app-default-layout')).toBeNull();
    expect(element.querySelector('app-clean-layout')).not.toBeNull();
    expect(element.querySelector(INPUT_AREA)).toBeNull();
    expect(control(element, 'Titel').value).toBe('Sommerkonzert');
  });

  // Audit 14.11. (U-11, statement 7): a framework applies the property
  // bindings of its template when the element is in the document already
  // (Angular: the creation pass attaches it, the update pass sets the
  // properties) - in the same task, but after the component has started.
  describe('configured in the same task, right after it was attached (property bindings of a template)', () => {
    function inputAreasDrawn(element: HTMLElement): { nodes: Element[]; stop(): void } {
      const nodes: Element[] = [];
      const observer = new MutationObserver(mutations => {
        for (const node of mutations.flatMap(mutation => Array.from(mutation.addedNodes))) {
          if (!(node instanceof Element)) continue;
          if (node.matches(INPUT_AREA)) nodes.push(node);
          nodes.push(...Array.from(node.querySelectorAll(INPUT_AREA)));
        }
      });
      observer.observe(element, { childList: true, subtree: true });
      return { nodes, stop: () => observer.disconnect() };
    }

    it('ends in the bound layout with the bound record; the default layout was built first and replaced unpainted', async () => {
      const element = create();
      const drawn = inputAreasDrawn(element);

      host.appendChild(element);
      Object.assign(element, { layout: 'clean', readonly: true, metadataInput: RECORD });
      const afterTheTask = { clean: !!element.querySelector('app-clean-layout'), inputArea: !!element.querySelector(INPUT_AREA) };
      await wait(150);
      drawn.stop();

      expect(afterTheTask).withContext('before the browser could paint').toEqual({ clean: true, inputArea: false });
      expect(element.querySelector('app-clean-layout')).not.toBeNull();
      expect(element.querySelector('app-default-layout')).toBeNull();
      expect(readonlyText(element, 'Titel')).toBe('Sommerkonzert');
      expect(drawn.nodes.length).withContext('the input area was in the DOM for a moment').toBeGreaterThan(0);
    });

    it('context-name and schema-version bound this way come too late: the schema is loaded with the defaults', async () => {
      const element = create();

      host.appendChild(element);
      Object.assign(element, { contextName: 'mds_oeh', schemaVersion: '1.8.1' });
      await wait(150);

      const asked = new Set(api.getSchema.calls.allArgs().map(args => `${args[0]} ${args[1]}`));
      expect(Array.from(asked)).toEqual(['default latest']);
    });

    it('set before it is attached, they are the ones the schema is loaded with', async () => {
      const element = create({ contextName: 'mds_oeh', schemaVersion: '1.8.1' });

      host.appendChild(element);
      await wait(150);

      const asked = new Set(api.getSchema.calls.allArgs().map(args => `${args[0]} ${args[1]}`));
      expect(Array.from(asked)).toEqual(['mds_oeh 1.8.1']);
    });
  });

  describe('taken out of the document and put back (U-08 a, W-38)', () => {
    it('comes back after 50 ms with its configuration and its record', async () => {
      const element = create({ layout: 'clean', readonly: true, metadataInput: RECORD });
      host.appendChild(element);
      await wait(100);
      const before = field(element, 'Titel');

      element.remove();
      await wait(50); // Angular destroyed the component after 10 ms
      host.appendChild(element);
      await wait(150);

      expect(field(element, 'Titel')).withContext('a new component drew the form').not.toBe(before);
      expect(element.querySelector('app-clean-layout')).not.toBeNull();
      expect(element.querySelector(INPUT_AREA)).withContext('not the default layout').toBeNull();
      expect(readonlyText(element, 'Titel')).withContext('readonly').toBe('Sommerkonzert');
      expect(field(element, 'Beginn')).toBeTruthy();
    });

    // Angular 21.2 builds no component on the first return: the element kept
    // the last DOM of the destroyed one and ignored the host from then on.
    it('is alive when it comes back: it takes inputs and reports edits', async () => {
      const element = create({ layout: 'clean', readonly: true, metadataInput: RECORD });
      const changes = records(element);
      host.appendChild(element);
      await wait(100);
      element.remove();
      await wait(50);
      host.appendChild(element);
      await wait(150);
      changes.length = 0;

      element['readonly'] = false;
      await wait(50);
      expect(control(element, 'Titel').disabled).toBeFalse();

      typeAndLeave(control(element, 'Titel'), 'Nach der Rückkehr');
      expect(changes.map(record => record['metadata']['cclom:title'])).toEqual(['Nach der Rückkehr']);
    });

    it('comes back a second and a third time', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      host.appendChild(element);
      await wait(100);

      for (let round = 0; round < 3; round++) {
        element.remove();
        await wait(50);
        host.appendChild(element);
        await wait(100);
      }

      expect(element.querySelectorAll('app-clean-layout').length).toBe(1);
      expect(control(element, 'Titel').value).toBe('Sommerkonzert');
    });

    it('comes back with what attributes configured', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-reattach" layout="detail"></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      await wait(100);

      element.remove();
      await wait(50);
      host.appendChild(element);
      await wait(100);

      expect(element.querySelector('app-detail-layout')).not.toBeNull();
    });

    // The limit: the form itself is not kept. What comes back is the record
    // the host handed in last, not what the editor typed since.
    it('comes back with the record of the host, not with edits made since', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      host.appendChild(element);
      await wait(100);
      typeAndLeave(control(element, 'Titel'), 'Getippt');

      element.remove();
      await wait(50);
      host.appendChild(element);
      await wait(150);

      expect(control(element, 'Titel').value).toBe('Sommerkonzert');
    });

    it('does not repeat a trigger: no second extraction, no reset', async () => {
      api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Konzert' }));
      const element = create({ text: 'Ein Konzert', autoExtract: true });
      host.appendChild(element);
      await wait(150);
      expect(api.generate).toHaveBeenCalledTimes(1);

      element.remove();
      await wait(50);
      host.appendChild(element);
      await wait(150);

      expect(api.generate).toHaveBeenCalledTimes(1);
    });

    it('moved within the same task: the component stays, nothing is imported again', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      host.appendChild(element);
      await wait(100);
      typeAndLeave(control(element, 'Titel'), 'Getippt');
      const seen = records(element);
      const other = document.createElement('div');
      document.body.appendChild(other);

      other.appendChild(element); // disconnect and connect at once
      await wait(100);

      expect(control(element, 'Titel').value).toBe('Getippt');
      expect(seen).withContext('no import, no event').toEqual([]);
      other.remove();
    });
  });

  describe('the same value assigned again (U-08 b)', () => {
    it('autoExtract = true starts an extraction each time', async () => {
      api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Konzert' }));
      const element = create({ text: 'Ein Konzert' });
      host.appendChild(element);
      await wait(100);

      element['autoExtract'] = true;
      await wait(100);
      element['text'] = 'Noch ein Konzert';
      element['autoExtract'] = true;
      await wait(100);

      expect(api.generate).toHaveBeenCalledTimes(2);
      expect(api.generate.calls.mostRecent().args[0].text).toBe('Noch ein Konzert');
    });

    it('forceReset = true empties the form each time', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      host.appendChild(element);
      await wait(100);

      element['forceReset'] = true;
      await wait(50);
      expect(element.querySelectorAll('app-field').length).toBe(0);

      element['metadataInput'] = { ...RECORD };
      await wait(100);
      expect(control(element, 'Titel').value).toBe('Sommerkonzert');

      element['forceReset'] = true;
      await wait(50);
      expect(element.querySelectorAll('app-field').length).toBe(0);
    });

    it('the auto-extract attribute set to the same value again fires again', async () => {
      api.generate.and.resolveTo(generated('event.json', { 'cclom:title': 'Konzert' }));
      const element = create({ text: 'Ein Konzert' });
      host.appendChild(element);
      await wait(100);

      element.setAttribute('auto-extract', 'true');
      await wait(100);
      element['text'] = 'Noch ein Konzert'; // the box is emptied after a run
      element.setAttribute('auto-extract', 'true');
      await wait(100);

      expect(api.generate).toHaveBeenCalledTimes(2);
    });

    // Decided, not fixed: the same object is no new record. A host that
    // changed a record hands in a new object.
    it('metadataInput: the same object again is not imported, a mutated one neither, a copy is', async () => {
      const record = { metadataset: 'event.json', metadata: { 'cclom:title': 'Eins' } };
      const element = create({ layout: 'clean', metadataInput: record });
      const seen = records(element);
      host.appendChild(element);
      await wait(100);
      expect(seen.length).toBe(1);

      element['metadataInput'] = record;
      record.metadata['cclom:title'] = 'Zwei';
      element['metadataInput'] = record;
      await wait(100);
      expect(seen.length).withContext('same object: no import').toBe(1);
      expect(control(element, 'Titel').value).toBe('Eins');

      element['metadataInput'] = { ...record };
      await wait(100);
      expect(seen.length).toBe(2);
      expect(control(element, 'Titel').value).toBe('Zwei');
    });

    it('metadataInput = null leaves the form as it is (W-48)', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      const seen = records(element);
      host.appendChild(element);
      await wait(100);

      element['metadataInput'] = null;
      await wait(100);

      expect(control(element, 'Titel').value).toBe('Sommerkonzert');
      expect(seen.length).toBe(1);
    });
  });

  describe('attributes removed, and attributes without a value (U-08 d, W-46)', () => {
    it('a removed readonly attribute hands the decision back to a read-only layout', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-readonly" layout="detail" readonly="false"></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      element['metadataInput'] = RECORD;
      await wait(100);
      expect(control(element, 'Titel').disabled).withContext('readonly="false" unlocks').toBeFalse();

      element.removeAttribute('readonly');
      await wait(50);

      expect(readonlyText(element, 'Titel')).withContext('the layout is read-only').toBe(RECORD.metadata['cclom:title']);
    });

    it('a removed readonly attribute unlocks an editable layout', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-unlock" layout="clean" readonly="true"></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      element['metadataInput'] = RECORD;
      await wait(100);
      expect(readonlyText(element, 'Titel')).toBe(RECORD.metadata['cclom:title']);

      element.removeAttribute('readonly');
      await wait(50);

      expect(control(element, 'Titel').disabled).toBeFalse();
    });

    it('a bare readonly attribute means read-only', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-bare" layout="clean" readonly></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      element['metadataInput'] = RECORD;
      await wait(100);

      expect(readonlyText(element, 'Titel')).toBe(RECORD.metadata['cclom:title']);
    });

    it('a removed show-input-area attribute brings the layout\'s input area back', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-area" show-input-area="false"></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      await wait(100);
      expect(element.querySelector(INPUT_AREA)).toBeNull();

      element.removeAttribute('show-input-area');
      await wait(50);

      expect(element.querySelector(INPUT_AREA)).not.toBeNull();
    });

    it('a removed layout attribute means the default layout', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-layout" layout="clean"></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      await wait(100);

      element.removeAttribute('layout');
      await wait(50);

      expect(element.querySelector('app-default-layout')).not.toBeNull();
    });

    it('a removed borderless attribute means the layout\'s value', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-style" borderless="true"></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      await wait(100);
      expect(element.classList.contains('borderless')).toBeTrue();

      element.removeAttribute('borderless');
      await wait(50);

      expect(element.classList.contains('borderless')).withContext('the default layout has a border').toBeFalse();
    });
  });

  describe('events', () => {
    it('reach a listener added with addEventListener, with the record as detail', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      const changes = records(element);
      host.appendChild(element);
      await wait(100);

      expect(changes.length).withContext('one event for the import').toBe(1);
      expect(changes[0]['metadata']).toEqual(RECORD.metadata);
      expect(changes[0]['metadataset']).toBe('event.json');
    });

    it('report an edit before the blur handler returns (W-36)', async () => {
      const element = create({ layout: 'clean', metadataInput: RECORD });
      const changes = records(element);
      host.appendChild(element);
      await wait(100);
      changes.length = 0;

      typeAndLeave(control(element, 'Titel'), 'Neuer Titel');

      expect(changes.map(record => record['metadata']['cclom:title'])).toEqual(['Neuer Titel']);
    });
  });

  describe('properties read back (U-08 c)', () => {
    it('answer with what the host set, as property or as attribute', async () => {
      host.innerHTML = `<${tag} instance-id="${tag}-getters" layout="clean" readonly></${tag}>`;
      const element = host.firstElementChild as CanvasElement;
      element['apiUrl'] = 'https://agent.example';
      element['showFloatingControls'] = false;
      element['metadataInput'] = RECORD;
      await wait(100);

      expect(element['layout']).toBe('clean');
      expect(element['readonly']).withContext('the attribute text').toBe('');
      expect(element['apiUrl']).toBe('https://agent.example');
      expect(element['showFloatingControls']).toBeFalse();
      expect(element['metadataInput']).toBe(RECORD);
      expect(element['columns']).withContext('never set').toBeUndefined();
    });

    it('answer for properties set before the element was defined', async () => {
      const later = `${tag}-later`;
      const element = document.createElement(later) as CanvasElement;
      element['layout'] = 'detail';
      element['instanceId'] = `${later}-instance`;
      host.appendChild(element);

      customElements.define(later, createCanvasElement(TestBed.inject(Injector)));
      await wait(100);

      expect(element['layout']).toBe('detail');
      expect(element.querySelector('app-detail-layout')).not.toBeNull();
    });
  });

  // W-48: a setter runs when it is set, ngOnChanges with the next change
  // detection. As long as the record waited for ngOnChanges, a type set in the
  // same task came first whatever the host had set first.
  describe('metadataInput and contentType: the order of setting decides (W-48)', () => {
    const PERSON_RECORD = { metadataset: 'person.json', metadata: { 'cclom:title': 'Ada' } };

    async function typeAfter(set: (element: CanvasElement) => void | Promise<void>): Promise<string> {
      const element = create({ layout: 'clean' });
      const seen = records(element);
      host.appendChild(element);
      await wait(100);
      await set(element);
      await wait(150);
      element.remove();
      return seen[seen.length - 1]['metadataset'];
    }

    it('record first, type second: the type of the host - in one task and a tick apart', async () => {
      const sameTask = await typeAfter(element => {
        element['metadataInput'] = PERSON_RECORD;
        element['contentType'] = 'event.json';
      });
      const tickApart = await typeAfter(async element => {
        element['metadataInput'] = { ...PERSON_RECORD };
        await wait(0);
        element['contentType'] = 'event.json';
      });

      expect(sameTask).toBe('event.json');
      expect(tickApart).toBe('event.json');
    });

    it('type first, record second: the type of the record - in one task and a tick apart', async () => {
      const sameTask = await typeAfter(element => {
        element['contentType'] = 'event.json';
        element['metadataInput'] = PERSON_RECORD;
      });
      const tickApart = await typeAfter(async element => {
        element['contentType'] = 'event.json';
        await wait(0);
        element['metadataInput'] = { ...PERSON_RECORD };
      });

      expect(sameTask).toBe('person.json');
      expect(tickApart).toBe('person.json');
    });
  });
});
