/**
 * Shape Expander Service
 * Expands fields with complex shapes into editable sub-fields
 * Handles nested objects like Place with address, geo coordinates, etc.
 * Ported from metadata-agent-canvas-optimized
 */

import { Injectable } from '@angular/core';
import { CanvasFieldState, FieldStatus } from '../shared/models/canvas.models';
import { SchemaService } from './schema.service';
import { declaresObjects, objectKeyFor, toObjectShape, variantsOf } from './object-shape';
import { isValueFilled } from './canvas-fields';

@Injectable({
  providedIn: 'root'
})
export class ShapeExpanderService {

  constructor(private schema: SchemaService) {}

  expandFieldWithShape(parentField: CanvasFieldState, extractedValue: any, schemaFieldDef?: any): CanvasFieldState[] {
    const system = schemaFieldDef?.system;
    if (!parentField.shape && !declaresObjects(system)) {
      return [];
    }

    const subFields: CanvasFieldState[] = [];
    const language = this.schema.getActiveLanguage();
    const key = parentField.objectKey || objectKeyFor(system);

    // A scalar or an empty value used to leave `subFields` empty, which made the
    // canvas fall back to a plain text input for a field the schema declares as
    // an object. Now the value is lifted into the object shape first, and an
    // empty field simply offers the empty form.
    const items: any[] = Array.isArray(extractedValue)
      ? extractedValue.map(item => toObjectShape(item, key)).filter(item => item !== null)
      : [toObjectShape(extractedValue, key)].filter(item => item !== null);

    if (items.length === 0) {
      items.push({});
    }

    items.forEach((item, index) => {
      subFields.push(...this.createSubFieldsFromObject(
        parentField, item, index, parentField.shape, schemaFieldDef, language, key
      ));
    });
    // The entries as they came in, for the way back (reconstructObjectFromSubFields).
    subFields.forEach(subField => (subField.objectOrigins = items));

    return subFields;
  }

  private createSubFieldsFromObject(
    parentField: CanvasFieldState,
    objectValue: any,
    arrayIndex: number,
    shapeDefinition: any,
    schemaFieldDef: any,
    language: 'de' | 'en',
    objectKey: string
  ): CanvasFieldState[] {
    const subFields: CanvasFieldState[] = [];

    // `variantsOf` also finds the older `system.variants` spelling. Schemas
    // released before the declaration styles were unified put the variants
    // there, and this lookup silently found nothing for every person field.
    const variants = variantsOf(schemaFieldDef?.system);
    if (variants.length) {
      const matchedVariant = this.findMatchingVariant(objectValue, variants) || variants[0];
      
      if (matchedVariant?.fields) {
        matchedVariant.fields.forEach((fieldDef: any) => {
          const fieldValue = objectValue[fieldDef.id];
          this.expandFieldRecursively(
            parentField, fieldDef, fieldValue, '', arrayIndex, language, subFields
          );
        });
        // "Default" stands for a variant without a type of its own, as in the
        // backend's prompt builder.
        const type = matchedVariant['@type'];
        if (type && type !== 'Default') {
          subFields.forEach(subField => (subField.objectType = type));
        }
      }
    } else if (!shapeDefinition) {
      // An object the schema describes no further (schema:provider in
      // course.json): one input for the key a bare name belongs in, as the
      // backend's normalizer has it. Every other key of the object stays as it
      // came (reconstructObjectFromSubFields). The field's own definition used
      // to stand in as the shape: 18 inputs "Provider (Label.de)" …, and
      // `label`, `description`, `prompt`, `system` in the record (audit 14.11., W-30).
      subFields.push(this.createSubField(
        parentField, objectKey, this.formatLabel(objectKey), 'string', objectValue[objectKey], arrayIndex
      ));
    } else {
      let activeShape = shapeDefinition;
      if (shapeDefinition.oneOf && Array.isArray(shapeDefinition.oneOf)) {
        const matchedShape = this.findMatchingShape(objectValue, shapeDefinition.oneOf);
        activeShape = matchedShape || shapeDefinition.oneOf[0];
      }

      Object.keys(activeShape).forEach(key => {
        if (key === 'oneOf' || key === '@type') return;

        const propertyDef = activeShape[key];
        const propertyValue = objectValue[key];

        if (typeof propertyDef === 'object' && !Array.isArray(propertyDef)) {
          const nestedKeys = Object.keys(propertyDef);
          if (nestedKeys.length > 0 && nestedKeys[0] !== 'type') {
            Object.keys(propertyDef).forEach(nestedKey => {
              const nestedValue = propertyValue && typeof propertyValue === 'object' 
                ? propertyValue[nestedKey] : null;
              const subField = this.createSubField(
                parentField, `${key}.${nestedKey}`, this.formatLabel(nestedKey),
                propertyDef[nestedKey], nestedValue, arrayIndex
              );
              subFields.push(subField);
            });
            return;
          }
        }

        const subField = this.createSubField(
          parentField, key, this.formatLabel(key),
          propertyDef, propertyValue, arrayIndex
        );
        subFields.push(subField);
      });
    }

    return subFields;
  }

  private expandFieldRecursively(
    parentField: CanvasFieldState,
    fieldDef: any,
    fieldValue: any,
    pathPrefix: string,
    arrayIndex: number,
    language: 'de' | 'en',
    subFields: CanvasFieldState[]
  ): void {
    const fullPath = pathPrefix ? `${pathPrefix}.${fieldDef.id}` : fieldDef.id;
    
    const subField = this.createSubFieldFromSchema(
      parentField, fullPath, fieldDef, fieldValue, arrayIndex, language
    );
    subFields.push(subField);

    if (fieldDef.fields && Array.isArray(fieldDef.fields) && fieldDef.fields.length > 0) {
      fieldDef.fields.forEach((nestedFieldDef: any) => {
        const nestedValue = fieldValue && typeof fieldValue === 'object'
          ? fieldValue[nestedFieldDef.id] : null;
        
        this.expandFieldRecursively(
          parentField, nestedFieldDef, nestedValue, fullPath, arrayIndex, language, subFields
        );
      });
    }
  }

  private findMatchingVariant(objectValue: any, variants: any[]): any {
    if (objectValue['@type']) {
      const match = variants.find(v => v['@type'] === objectValue['@type']);
      if (match) return match;
    }
    // Without a usable type: the variant most of whose subfields the object
    // has, the first one on a tie. The export writes the variant's type into
    // the object (W-LOG-03), so {url} must not come out as a "Place".
    const known = (variant: any) =>
      (variant.fields || []).filter((f: any) => objectValue[f.id] !== undefined && objectValue[f.id] !== null).length;
    return variants.reduce((best, variant) => (known(variant) > known(best) ? variant : best), variants[0]);
  }

  private findMatchingShape(objectValue: any, oneOfShapes: any[]): any {
    if (objectValue['@type']) {
      const match = oneOfShapes.find(shape => shape['@type'] === objectValue['@type']);
      if (match) return match;
    }

    let bestMatch = oneOfShapes[0];
    let maxMatches = 0;

    oneOfShapes.forEach(shape => {
      const shapeKeys = Object.keys(shape).filter(k => k !== '@type' && k !== 'oneOf');
      const objectKeys = Object.keys(objectValue);
      const matches = shapeKeys.filter(k => objectKeys.includes(k)).length;

      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = shape;
      }
    });

    return bestMatch;
  }

  private createSubFieldFromSchema(
    parentField: CanvasFieldState,
    propertyPath: string,
    fieldDef: any,
    value: any,
    arrayIndex: number,
    language: 'de' | 'en'
  ): CanvasFieldState {
    const fullPath = arrayIndex > 0 
      ? `${parentField.fieldId}[${arrayIndex}].${propertyPath}`
      : `${parentField.fieldId}.${propertyPath}`;

    const label = this.schema.localizeString(fieldDef.label, language) || this.formatLabel(fieldDef.id);
    const description = this.schema.localizeString(fieldDef.description, language) || '';
    const datatype = fieldDef.system?.datatype || 'string';
    const hasNestedFields = fieldDef.fields && Array.isArray(fieldDef.fields) && fieldDef.fields.length > 0;

    return {
      fieldId: fullPath,
      uri: fieldDef.system?.uri || `${parentField.uri}#${propertyPath}`,
      label: label,
      description: description,
      group: parentField.group,
      groupLabel: parentField.groupLabel,
      groupOrder: parentField.groupOrder,
      schemaName: parentField.schemaName,
      aiFillable: fieldDef.system?.ai_fillable !== false,
      repoField: parentField.repoField,
      status: value !== null && value !== undefined ? FieldStatus.FILLED : FieldStatus.EMPTY,
      value: value,
      confidence: value !== null && value !== undefined ? 1.0 : 0,
      isRequired: fieldDef.system?.required || false,
      datatype: datatype,
      multiple: fieldDef.system?.multiple || false,
      parentFieldId: parentField.fieldId,
      parentFieldLabel: parentField.label,
      path: propertyPath,
      arrayIndex: arrayIndex,
      isParent: hasNestedFields,
      validation: fieldDef.system?.validation,
      normalization: fieldDef.system?.normalization,
      vocabulary: fieldDef.system?.vocabulary ? {
        type: fieldDef.system.vocabulary.type || 'open',
        concepts: this.schema.localizeVocabulary(fieldDef.system.vocabulary, language)
      } : undefined
    };
  }

  private createSubField(
    parentField: CanvasFieldState,
    propertyPath: string,
    label: string,
    typeDef: any,
    value: any,
    arrayIndex: number
  ): CanvasFieldState {
    const datatype = this.inferDatatype(typeDef);
    const fullPath = arrayIndex > 0 
      ? `${parentField.fieldId}[${arrayIndex}].${propertyPath}`
      : `${parentField.fieldId}.${propertyPath}`;

    return {
      fieldId: fullPath,
      uri: `${parentField.uri}#${propertyPath}`,
      label: label,
      // No description: it is the input's placeholder, and the label already
      // names the parent ("Veranstalter (Name)"); the English text stood there (U-2).
      description: '',
      repoField: parentField.repoField,
      group: parentField.group,
      groupLabel: parentField.groupLabel,
      groupOrder: parentField.groupOrder,
      schemaName: parentField.schemaName,
      aiFillable: false,
      status: value !== null && value !== undefined ? FieldStatus.FILLED : FieldStatus.EMPTY,
      value: value,
      confidence: value !== null && value !== undefined ? 1.0 : 0,
      isRequired: false,
      datatype: datatype,
      multiple: false,
      parentFieldId: parentField.fieldId,
      parentFieldLabel: parentField.label,
      path: propertyPath,
      arrayIndex: arrayIndex
    };
  }

  private inferDatatype(typeDef: any): string {
    if (typeof typeDef === 'string') {
      switch (typeDef) {
        case 'number': return 'number';
        case 'integer': return 'integer';
        case 'boolean': return 'boolean';
        case 'uri': case 'url': return 'uri';
        case 'date': return 'date';
        default: return 'string';
      }
    }
    return 'string';
  }

  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  reconstructObjectFromSubFields(parentField: CanvasFieldState, allFields: CanvasFieldState[]): any {
    const entries = this.entriesOf(parentField, allFields);
    if (!entries) {
      return parentField.value;
    }
    // An untouched object form must not be exported. Object fields always
    // offer their form — including empty ones, so nobody types a bare name
    // into a text input — and without this filter every unfilled object field
    // would write `[{}]` into ccm:oeh_extendedData. The rule for "empty" is
    // the one of the whole record (isValueFilled, W-41).
    const filled = entries.filter(entry => isValueFilled(entry));
    return parentField.multiple ? filled : filled[0];
  }

  /**
   * Every entry of an object field as the form holds it, by `arrayIndex` -
   * also the empty ones, which the value leaves out. What adding and removing
   * an entry works on (W-42).
   */
  objectEntries(parentField: CanvasFieldState): any[] {
    return this.entriesOf(parentField, []) ?? [];
  }

  /** The entries behind the subfields of `parentField`; null without subfields. */
  private entriesOf(parentField: CanvasFieldState, allFields: CanvasFieldState[]): any[] | null {
    let subFields: CanvasFieldState[];

    if (parentField.subFields && parentField.subFields.length > 0) {
      subFields = parentField.subFields;
    } else {
      subFields = allFields.filter(f => f.parentFieldId === parentField.fieldId);
    }

    if (subFields.length === 0) {
      return null;
    }

    const groupedByIndex = new Map<number, CanvasFieldState[]>();
    subFields.forEach(field => {
      const index = field.arrayIndex || 0;
      if (!groupedByIndex.has(index)) {
        groupedByIndex.set(index, []);
      }
      groupedByIndex.get(index)!.push(field);
    });

    // Each entry as it came in is the base of what goes out (W-LOG-03): the
    // form only knows the subfields of one variant, so the discriminator and
    // every other key the entry brought used to be lost on export, upload and
    // in existing_metadata. An entry whose variant has no subfields at all
    // (PostalAddress in event.json) stays as it is. Not read from
    // parentField.value: after an edit that is the list without its emptied
    // entries, and `arrayIndex` no longer counts it.
    const origins = subFields[0].objectOrigins || [];
    const entries = Math.max(origins.length, ...Array.from(groupedByIndex.keys(), index => index + 1));

    const reconstructedObjects: any[] = [];
    for (let index = 0; index < entries; index++) {
      const fields = groupedByIndex.get(index) || [];
      const obj = this.buildObjectFromFields(fields, origins[index]);
      const type = fields[0]?.objectType;
      if (type && !obj['@type']) {
        obj['@type'] = type;
      }
      reconstructedObjects.push(obj);
    }

    return reconstructedObjects;
  }

  /**
   * The object of one entry: `origin` with the subfields laid over it. A
   * subfield without a value removes its key - the editor emptied it. Every
   * object written into is a copy; `origin` belongs to the host page.
   *
   * A container the form shows (`address`, `geo`) is left out while nothing
   * is in it: every entry used to come back with `address: {}` and `geo: {}`,
   * also in a record that had neither (audit 14.11., W-41). Keys the form
   * does not show stay as they came, empty or not (W-LOG-03).
   */
  private buildObjectFromFields(fields: CanvasFieldState[], origin?: any): any {
    const isObject = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
    const result: any = isObject(origin) ? { ...origin } : {};
    const own = new Set<any>([result]);
    const container = (parent: any, key: string): any => {
      if (!own.has(parent[key])) {
        parent[key] = isObject(parent[key]) ? { ...parent[key] } : {};
        own.add(parent[key]);
      }
      return parent[key];
    };

    fields.forEach(field => {
      if (!field.path) return;

      const pathParts = field.path.split('.');
      let current = result;
      for (const part of pathParts.slice(0, -1)) {
        current = container(current, part);
      }

      const lastPart = pathParts[pathParts.length - 1];
      if (field.isParent) {
        // A nested object: the subfields below it fill it.
        container(current, lastPart);
      } else if (field.value !== null && field.value !== undefined) {
        current[lastPart] = field.value;
      } else {
        delete current[lastPart];
      }
    });

    // Innermost first: a container holding only an empty container is empty.
    const containers = new Set<string>();
    fields.forEach(field => {
      const parts = (field.path || '').split('.');
      const depth = field.isParent ? parts.length : parts.length - 1;
      for (let length = 1; length <= depth; length++) containers.add(parts.slice(0, length).join('.'));
    });
    const innermostFirst = Array.from(containers, path => path.split('.')).sort((a, b) => b.length - a.length);
    for (const parts of innermostFirst) {
      const parent = parts.slice(0, -1).reduce((object, part) => object?.[part], result);
      const key = parts[parts.length - 1];
      if (isObject(parent) && !isValueFilled(parent[key])) delete parent[key];
    }

    return result;
  }
}
