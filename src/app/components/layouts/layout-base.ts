import { Directive, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { CanvasFieldState, CanvasState, FieldGroup, FieldStatus } from '../../shared/models/canvas.models';
import { uniqueId } from '../../shared/unique-id';
import { ObjectEntryChange, ObjectEntryControls } from '../field/field.component';

/**
 * What the seven layouts share: which groups are shown, which fields of a group
 * are visible, and the counts per group. Each layout class carried its own copy
 * of this (audit M-02); the copies had already started to drift.
 *
 * Inputs every layout takes live here; a layout with another default overrides
 * the property (`override readonly = true`).
 */
@Directive()
export abstract class LayoutBase implements OnChanges {
  @Input() state: CanvasState | null = null;
  @Input() showCoreFields = true;
  @Input() showSpecialFields = true;
  @Input() readonly = false;
  @Input() flatGroups = false;
  /**
   * Groups can be collapsed from their header (preset key `groupCollapse`).
   * A layout whose preset says so overrides the default, like `readonly`.
   */
  @Input() groupCollapse = false;

  /** Prefix of the ids aria-controls points at; unique per instance. */
  readonly _uid = uniqueId('layout');

  // What app-extraction-feedback reports, the same in every layout (audit 14.11., U-03, U-12).
  @Output() cancelExtraction = new EventEmitter<void>();
  @Output() dismissError = new EventEmitter<void>();
  @Output() dismissWarning = new EventEmitter<void>();
  /** A button of an object list: add an entry, or remove one (W-42). */
  @Output() objectEntryChange = new EventEmitter<ObjectEntryChange>();

  // Cached computed values (recomputed in ngOnChanges, not every CD cycle)
  _displayGroups: FieldGroup[] = [];
  /** Pre-computed visible fields per group (avoids recreating arrays in *ngFor) */
  _visibleFieldsMap = new Map<string, CanvasFieldState[]>();
  _filledCountMap = new Map<string, number>();
  _flatCountMap = new Map<string, number>();
  /** By the id of an entry's last input: the entry's buttons (W-42). */
  _entryControls = new Map<string, ObjectEntryControls>();

  private readonly translate = inject(TranslateService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['state'] || changes['flatGroups'] || changes['showCoreFields'] || changes['showSpecialFields'] || changes['readonly']) {
      this._displayGroups = this.computeDisplayGroups();
      this.precomputeGroupData();
      this.onGroupsChanged();
    }
  }

  /** Hook for layouts that derive more from the groups (progress, required count). */
  protected onGroupsChanged(): void {}

  trackByFieldId(index: number, field: CanvasFieldState): string {
    return field.fieldId;
  }

  trackByGroupId(index: number, group: FieldGroup): string {
    return group.id;
  }

  getFlattenedFields(fields: CanvasFieldState[]): CanvasFieldState[] {
    const flattened: CanvasFieldState[] = [];
    for (const field of fields) {
      if (field.isParent && field.subFields && field.subFields.length > 0) {
        flattened.push(...field.subFields);
      } else if (!field.isParent) {
        flattened.push(field);
      }
    }
    return flattened;
  }

  getVisibleFields(fields: CanvasFieldState[]): CanvasFieldState[] {
    const flat = this.getFlattenedFields(fields);
    if (!this.readonly) return flat;
    return flat.filter(f => {
      if (f.value === null || f.value === undefined || f.value === '') return false;
      if (Array.isArray(f.value) && f.value.length === 0) return false;
      return true;
    });
  }

  private computeDisplayGroups(): FieldGroup[] {
    if (!this.state?.fieldGroups) return [];
    if (!this.flatGroups) return this.state.fieldGroups;
    return this.mergeGroupsBySchema(this.state.fieldGroups);
  }

  private mergeGroupsBySchema(groups: FieldGroup[]): FieldGroup[] {
    if (groups.length === 0) return [];
    const allFields: CanvasFieldState[] = [];
    let schemaLabel = '';
    let schemaIcon = '';
    for (const group of groups) {
      if (group.isCore && !this.showCoreFields) continue;
      if (!group.isCore && !this.showSpecialFields) continue;
      allFields.push(...group.fields);
      if (!group.isCore && !schemaLabel) {
        schemaLabel = group.schemaName;
        schemaIcon = group.icon || '';
      }
    }
    if (allFields.length === 0) return [];
    // The merged group is new on every change; its header must not reopen it (U-09).
    const collapsed = this._displayGroups.find(g => g.id === 'flat-all')?.collapsed;
    return [{
      id: 'flat-all',
      label: this.state?.contentTypeLabel || schemaLabel || this.translate.instant('LAYOUT.ALL_FIELDS'),
      icon: schemaIcon,
      schemaName: schemaLabel || 'Core',
      fields: allFields,
      isCore: false,
      ...(collapsed ? { collapsed } : {})
    }];
  }

  /**
   * The entries of the object lists among `fields`: each ends with its last
   * input, where its buttons go. Containers (an address) are no inputs.
   */
  private collectEntryControls(fields: CanvasFieldState[]): void {
    for (const parent of fields) {
      if (!parent.isParent || !parent.multiple || !parent.subFields?.length) continue;
      const inputs = parent.subFields.filter(sub => !sub.isParent);
      const count = Math.max(...inputs.map(sub => sub.arrayIndex ?? 0)) + 1;
      for (let index = 0; index < count; index++) {
        const ofEntry = inputs.filter(sub => (sub.arrayIndex ?? 0) === index);
        const last = ofEntry[ofEntry.length - 1];
        if (!last) continue;
        this._entryControls.set(last.fieldId, {
          parentId: parent.fieldId,
          parentLabel: parent.label,
          index,
          last: index === count - 1,
          removable: count > 1 || ofEntry.some(sub => sub.status === FieldStatus.FILLED),
        });
      }
    }
  }

  private precomputeGroupData(): void {
    this._visibleFieldsMap.clear();
    this._filledCountMap.clear();
    this._flatCountMap.clear();
    this._entryControls.clear();
    for (const group of this._displayGroups) {
      this.collectEntryControls(group.fields);
      const visible = this.getVisibleFields(group.fields);
      this._visibleFieldsMap.set(group.id, visible);
      const flat = this.getFlattenedFields(group.fields);
      this._filledCountMap.set(group.id, flat.filter(f => f.status === FieldStatus.FILLED).length);
      this._flatCountMap.set(group.id, flat.length);
    }
  }
}
