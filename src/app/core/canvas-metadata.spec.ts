import { CanvasFieldState, FieldStatus, createInitialState } from '../shared/models/canvas.models';
import { collectMetadata, exportMetadata } from './canvas-metadata';

function field(partial: Partial<CanvasFieldState>): CanvasFieldState {
  return { fieldId: 'x', status: FieldStatus.EMPTY, value: null, ...partial } as CanvasFieldState;
}

const shapeExpander = { reconstructObjectFromSubFields: () => ({ name: 'Rekonstruiert' }) } as any;
const schema = {
  getContentTypeConcepts: () => [{ schema_file: 'event.json', uri: 'http://w3id.org/event' }],
  getContextName: () => 'default',
  getSchemaVersion: () => '1.8.1',
} as any;

describe('canvas-metadata', () => {
  it('collects filled values, origins and the source text for a re-extraction', () => {
    const state = {
      ...createInitialState(),
      userText: 'Ein Konzert.',
      coreFields: [
        field({ fieldId: 'cclom:title', value: 'Konzert', status: FieldStatus.FILLED, isAiGenerated: true }),
        field({ fieldId: 'cclom:general_keyword', value: [] }),
        field({ fieldId: 'cclom:general_description', value: 'Text', status: FieldStatus.FILLED, isAiGenerated: false }),
      ],
      specialFields: [
        field({ fieldId: 'schema:location', isParent: true, subFields: [field({ fieldId: 'schema:location.name' })] }),
        field({ fieldId: 'schema:location.name', parentFieldId: 'schema:location', value: 'Weimar' }),
      ],
    };

    expect(collectMetadata(state, shapeExpander)).toEqual({
      'cclom:title': 'Konzert',
      'cclom:general_description': 'Text',
      'schema:location': { name: 'Rekonstruiert' },
      _origins: { 'cclom:title': 'ai', 'cclom:general_description': 'user' },
      _source_text: 'Ein Konzert.',
    });
  });

  it('exports without internal keys and with the content type uri', () => {
    const state = {
      ...createInitialState(),
      selectedContentType: 'event.json',
      metadata: { 'cclom:title': 'Konzert', _origins: { x: 'ai' }, _source_text: 'alt' },
      coreFields: [field({ fieldId: 'cclom:title', value: 'Konzert', status: FieldStatus.FILLED, isAiGenerated: true })],
    };

    const result = exportMetadata(state, shapeExpander, schema, 'de');

    expect(result['metadata']).toEqual({ 'cclom:title': 'Konzert' });
    expect(result['metadataset']).toBe('event.json');
    expect(result['metadataset_uri']).toBe('http://w3id.org/event');
    expect(result['language']).toBe('de');
    expect(result['contextName']).toBe('default');
    expect(result['_origins']).toEqual({ 'cclom:title': 'ai' });
    expect(result['_source_text']).toBeUndefined();
  });
});
