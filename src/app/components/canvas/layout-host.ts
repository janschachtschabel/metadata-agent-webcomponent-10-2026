import {
  Binding,
  ComponentRef,
  Type,
  ViewContainerRef,
  inputBinding,
  outputBinding,
  reflectComponentType,
} from '@angular/core';

import { DefaultLayoutComponent } from '../layouts/default-layout/default-layout.component';
import { PluginLayoutComponent } from '../layouts/plugin-layout/plugin-layout.component';
import { DialogLayoutComponent } from '../layouts/dialog-layout/dialog-layout.component';
import { DetailLayoutComponent } from '../layouts/detail-layout/detail-layout.component';
import { CleanLayoutComponent } from '../layouts/clean-layout/clean-layout.component';
import { PrueftischLayoutComponent } from '../layouts/prueftisch-layout/prueftisch-layout.component';
import { PrueftischOrgLayoutComponent } from '../layouts/prueftisch-org-layout/prueftisch-org-layout.component';

/** The layout components the canvas can render, by layout name. */
export const LAYOUT_COMPONENTS = {
  default: DefaultLayoutComponent,
  plugin: PluginLayoutComponent,
  dialog: DialogLayoutComponent,
  detail: DetailLayoutComponent,
  clean: CleanLayoutComponent,
  prueftisch: PrueftischLayoutComponent,
  'prueftisch-org': PrueftischOrgLayoutComponent,
} satisfies Record<string, Type<unknown>>;

export type LayoutName = keyof typeof LAYOUT_COMPONENTS;

/** Values the canvas offers its layout, read on every change detection. */
export type LayoutInputs = Record<string, () => unknown>;
/** What the canvas does with a layout event. */
export type LayoutOutputs = Record<string, (event: any) => void>;

/**
 * Render a layout into `host`, bound to the canvas.
 *
 * One list of bindings for all layouts instead of seven template blocks that
 * repeated the same ~40 bindings (audit M-02). Each layout receives the
 * bindings it declares and no others: the layouts differ only in a few extras
 * (upload buttons, JSON loader, page mode), and binding a name a component does
 * not declare is an error in Angular.
 */
export function createLayout(
  host: ViewContainerRef,
  type: Type<unknown>,
  inputs: LayoutInputs,
  outputs: LayoutOutputs,
): ComponentRef<unknown> {
  const mirror = reflectComponentType(type);
  const declaredInputs = new Set(mirror?.inputs.map(input => input.templateName));
  const declaredOutputs = new Set(mirror?.outputs.map(output => output.templateName));
  const bindings: Binding[] = [
    ...Object.entries(inputs)
      .filter(([name]) => declaredInputs.has(name))
      .map(([name, value]) => inputBinding(name, value)),
    ...Object.entries(outputs)
      .filter(([name]) => declaredOutputs.has(name))
      .map(([name, listener]) => outputBinding(name, listener)),
  ];
  host.clear();
  return host.createComponent(type, { bindings });
}
