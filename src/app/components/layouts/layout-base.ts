import { Directive, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { CanvasFieldState, CanvasState, FieldGroup, FieldStatus } from '../../shared/models/canvas.models';

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

  // Cached computed values (recomputed in ngOnChanges, not every CD cycle)
  _displayGroups: FieldGroup[] = [];
  /** Pre-computed visible fields per group (avoids recreating arrays in *ngFor) */
  _visibleFieldsMap = new Map<string, CanvasFieldState[]>();
  _filledCountMap = new Map<string, number>();
  _flatCountMap = new Map<string, number>();

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

  private precomputeGroupData(): void {
    this._visibleFieldsMap.clear();
    this._filledCountMap.clear();
    this._flatCountMap.clear();
    for (const group of this._displayGroups) {
      const visible = this.getVisibleFields(group.fields);
      this._visibleFieldsMap.set(group.id, visible);
      const flat = this.getFlattenedFields(group.fields);
      this._filledCountMap.set(group.id, flat.filter(f => f.status === FieldStatus.FILLED).length);
      this._flatCountMap.set(group.id, flat.length);
    }
  }
}
