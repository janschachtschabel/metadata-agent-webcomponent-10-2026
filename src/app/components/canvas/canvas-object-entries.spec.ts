/**
 * Audit 14.11. (W-42, the interface half): an event with two venues, a person
 * with two affiliations - the entries of an object list could be edited but
 * neither added nor removed. A button for each, at the end of the entry and of
 * the list; from the button to the record.
 */
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { CORE_SCHEMA, CanvasHarness, mountCanvas } from '../../testing/canvas-harness';

const text = (id: string, label: string) => ({ id, label: { de: label }, system: { datatype: 'string' } });
const LOCATION = {
  id: 'schema:location',
  label: { de: 'Ort' },
  system: {
    datatype: 'array',
    multiple: true,
    items: {
      datatype: 'object',
      variants: [{
        '@type': 'Place',
        fields: [
          text('name', 'Name'),
          { id: 'address', label: { de: 'Adresse' }, system: { datatype: 'object' }, fields: [text('addressLocality', 'Stadt')] },
        ],
      }],
    },
  },
};
const ORGANIZER = {
  id: 'schema:organizer',
  label: { de: 'Veranstalter' },
  system: { datatype: 'object', multiple: false },
};
const SCHEMAS = { 'core.json': CORE_SCHEMA, 'event.json': { fields: [LOCATION, ORGANIZER], groups: [] } };
const AULA = { '@type': 'Place', name: 'Aula', address: { addressLocality: 'Kassel' } };
const HOF = { '@type': 'Place', name: 'Hof' };

const TEXTS = {
  FIELD: {
    ADD_ENTRY: 'Eintrag hinzufügen', ADD_ENTRY_FOR: 'Eintrag hinzufügen: {{field}}',
    REMOVE_ENTRY: 'Eintrag entfernen', REMOVE_ENTRY_FOR: 'Eintrag entfernen: {{field}}, Eintrag {{number}}',
  },
};

for (const layout of ['default', 'clean', 'dialog', 'plugin', 'prueftisch', 'detail', 'prueftisch-org']) {
  describe(`CanvasComponent (${layout}): entries of an object list`, () => {
    let h: CanvasHarness;

    beforeEach(async () => {
      h = await mountCanvas({ layout, readonly: false }, SCHEMAS);
      TestBed.inject(TranslateService).setTranslation('de', TEXTS, true);
      await h.set('metadataInput', { metadataset: 'event.json', metadata: { 'cclom:title': 'Sommerfest', 'schema:location': [AULA, HOF] } });
    });
    afterEach(() => localStorage.removeItem('metadata-agent-canvas.language'));

    const removeButtons = () => Array.from(h.root.querySelectorAll<HTMLButtonElement>('.entry-actions .btn-remove-entry'));
    const addButtons = () => Array.from(h.root.querySelectorAll<HTMLButtonElement>('.entry-actions .btn-add-entry'));
    const names = () => Array.from(h.root.querySelectorAll<HTMLTextAreaElement>('app-field'))
      .filter(el => el.querySelector('mat-label')?.textContent?.trim().startsWith('Ort (Name)'))
      .map(el => (el.querySelector('textarea') as HTMLTextAreaElement).value);
    const record = () => h.canvas.getMetadataForExport()['metadata']['schema:location'];

    it('offers to remove each entry and to add one after the last, by name', () => {
      expect(names()).toEqual(['Aula', 'Hof']);
      expect(removeButtons().map(b => b.getAttribute('aria-label'))).toEqual([
        'Eintrag entfernen: Ort, Eintrag 1', 'Eintrag entfernen: Ort, Eintrag 2',
      ]);
      expect(removeButtons().map(b => b.textContent!.replace('delete', '').trim())).toEqual(['Eintrag entfernen', 'Eintrag entfernen']);
      expect(addButtons().map(b => b.getAttribute('aria-label'))).toEqual(['Eintrag hinzufügen: Ort']);
      // The remove button of an entry follows its last input: "Stadt" of the first, "Name" of the second has none before "Stadt".
      const first = removeButtons()[0].closest('app-field')!.querySelector('mat-label')!.textContent!.trim();
      expect(first).toBe('Ort (Stadt)');
    });

    it('can be used from the keyboard', () => {
      for (const button of [...removeButtons(), ...addButtons()]) {
        expect(button.getAttribute('type')).toBe('button');
        expect(button.disabled).toBeFalse();
        expect(button.tabIndex).toBe(0);
      }
    });

    it('adds an empty entry form; the record changes when it is filled', async () => {
      addButtons()[0].click();
      await h.settle();

      expect(names()).toEqual(['Aula', 'Hof', '']);
      expect(record()).toEqual([AULA, HOF]);
      expect(addButtons().length).withContext('one add button, after the new last entry').toBe(1);
      expect(removeButtons().length).toBe(3);
    });

    it('removes an entry from the form and from the record, and tells the host', async () => {
      const changes: Record<string, any>[] = [];
      h.component.metadataChange.subscribe(value => changes.push(value));

      removeButtons()[0].click();
      await h.settle();

      expect(names()).toEqual(['Hof']);
      expect(record()).toEqual([HOF]);
      expect(changes.at(-1)?.['metadata']['schema:location']).toEqual([HOF]);
    });

    it('offers nothing to remove for a single entry nobody filled', async () => {
      removeButtons()[1].click();
      await h.settle();
      removeButtons()[0].click();
      await h.settle();

      expect(names()).toEqual(['']);
      expect(removeButtons()).toEqual([]);
      expect(addButtons().length).toBe(1);
    });

    it('offers neither for an object field that holds one object', () => {
      const organizer = Array.from(h.root.querySelectorAll('app-field'))
        .find(el => el.querySelector('mat-label')?.textContent?.trim().startsWith('Veranstalter'))!;

      expect(organizer.querySelector('.entry-actions')).toBeNull();
    });

    it('offers neither in a read-only view', async () => {
      await h.set('readonly', true);

      expect(h.root.querySelector('.entry-actions')).toBeNull();
    });
  });
}
