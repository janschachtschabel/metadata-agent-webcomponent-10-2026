/**
 * Audit 14.11. (W-N): the model types named fewer datatypes and vocabulary
 * types than the schemas declare, so the code that handles them went around
 * the types (`as string`, `any`). What this spec asserts is checked by the
 * compiler: it does not build when a member is missing.
 */
import { FieldDataType, FieldDefinition, VocabularyInfo } from './canvas.models';

describe('canvas models', () => {
  it('name every datatype the 2.0.0 schemas declare', () => {
    // Collected from metadata-agent-3/src/schemata/default/v2.0.0/*.json.
    const inSchemas: FieldDataType[] = ['array', 'boolean', 'date', 'datetime', 'integer', 'number', 'object', 'string', 'time', 'uri'];

    expect(new Set(inSchemas).size).toBe(10);
  });

  it('name the datatypes the field component has a control for besides', () => {
    const drawn: FieldDataType[] = ['url', 'duration', 'json'];

    expect(drawn.length).toBe(3);
  });

  it('know the vocabulary type of the 2.0.0 schemas', () => {
    const vocabulary: VocabularyInfo = { type: 'skos', concepts: [] };
    const field: Pick<FieldDefinition, 'id'> & { system: Pick<FieldDefinition['system'], 'datatype' | 'vocabulary'> } = {
      id: 'ccm:taxonid',
      system: { datatype: 'uri', vocabulary },
    };

    expect(field.system.vocabulary?.type).toBe('skos');
  });
});
