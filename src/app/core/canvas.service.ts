import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { 
  CanvasState, 
  CanvasFieldState, 
  FieldStatus,
  createInitialState 
} from '../shared/models/canvas.models';
import { SchemaService } from './schema.service';
import { ApiService, GenerateRequest, GenerateResponse } from './api.service';
import { I18nService } from './i18n.service';
import { LoggerService } from './logger.service';
import { ShapeExpanderService } from './shape-expander.service';
import { declaresObjects, objectKeyFor } from './object-shape';
import { CachedValues, InstanceRegistry, RunInput, RunOutcome, SharedInstanceState, emptyBookkeeping } from './instance-registry';
import { getCountableFields, groupFields, isValueFilled, sameValue } from './canvas-fields';
import { assertUsable, describeFailure, failureCause, generationWarning, translated } from './canvas-feedback';
import { ImportedRecord, collectMetadata, exportMetadata, readRecord, withoutInternalKeys } from './canvas-metadata';

/** Label, position and icon of the groups of one schema, by group id. */
interface GroupInfo {
  labels: Map<string, string>;
  order: Map<string, number>;
  icons: Map<string, string>;
}

/**
 * Canvas Service - Simplified State Management
 * Uses API for all AI operations, no local LLM calls
 */
@Injectable()
export class CanvasService {
  private stateSubject: BehaviorSubject<CanvasState>;

  /**
   * Proxy that emits the current stateSubject.
   * switchMap in state$ automatically re-subscribes when stateSubject is swapped
   * (e.g. when instance changes at runtime).
   */
  private stateProxy$: BehaviorSubject<BehaviorSubject<CanvasState>>;

  /** Cache field values per content type so switching back restores them */
  private fieldValueCache: Map<string, CachedValues>;

  private _instanceId = 'default';

  /**
   * What decides about runs lives with the state it writes into: elements with
   * the same instance-id share one state, so they share these as well (an
   * edit, a reset or an import in one element applies to a run started in
   * another). Until bindToInstance() the service has a scope of its own.
   */
  private shared: SharedInstanceState;

  /** Run numbers are unique across instances, so a run never matches another instance's. */
  private static runSequence = 0;

  /**
   * Number of the newest extraction. Requests are not ordered: a reset, a second
   * extraction or a content-type switch can start while one is still running.
   * Each run remembers its number and drops what it receives once a newer run
   * (or a reset) has taken over, so the previous page cannot land in the form.
   */
  private get generation(): number {
    return this.shared.generation;
  }

  /**
   * Fields the editor changed while the current run was out, as they were
   * after the edit, by top-level field id (audit L-01). The fields stay editable during an extraction; without this
   * the AI value that arrived afterwards replaced what was just typed. Cleared
   * when a run starts: values from before a run reach the backend as
   * existing_metadata with their origins, which decides about them (U-06).
   */
  private get editsDuringRun(): Map<string, CanvasFieldState> {
    return this.shared.editsDuringRun;
  }

  constructor(
    private schema: SchemaService,
    private api: ApiService,
    private i18n: I18nService,
    private logger: LoggerService,
    private shapeExpander: ShapeExpanderService,
    private ngZone: NgZone
  ) {
    // Start with own state; bindToInstance() will swap to shared state
    this.stateSubject = new BehaviorSubject<CanvasState>(createInitialState());
    this.stateProxy$ = new BehaviorSubject(this.stateSubject);
    this.fieldValueCache = new Map();
    this.shared = {
      stateSubject: this.stateSubject,
      fieldValueCache: this.fieldValueCache,
      ...emptyBookkeeping(),
    };
    this.logger.info('CanvasService initialized (API mode)');
  }

  /**
   * Bind this service instance to a shared instance scope.
   * Two CanvasComponents with the same instanceId share one
   * BehaviorSubject (state), one fieldValueCache and the run bookkeeping.
   * A run still out from before the switch cannot write into the new scope:
   * its number is not that scope's (run numbers are unique). The scope's own
   * runs, started by other elements, are not cut short by an element joining.
   */
  bindToInstance(instanceId: string): void {
    this._instanceId = instanceId;
    const shared = InstanceRegistry.getOrCreate(instanceId);
    this.shared = shared;
    this.stateSubject = shared.stateSubject;
    this.fieldValueCache = shared.fieldValueCache;
    // Notify proxy so existing subscriptions (via state$) switch to the new subject
    this.stateProxy$.next(this.stateSubject);
    this.logger.info(`CanvasService bound to instance "${instanceId}"`);
  }

  get instanceId(): string {
    return this._instanceId;
  }

  /**
   * Observable of state — automatically follows the current stateSubject,
   * even when bindToInstance() swaps it at runtime.
   */
  get state$(): Observable<CanvasState> {
    return this.stateProxy$.pipe(switchMap(subj => subj.asObservable()));
  }

  getCurrentState(): CanvasState {
    return this.stateSubject.value;
  }

  private updateState(partial: Partial<CanvasState>): void {
    this.updateScope(this.shared, partial);
  }

  private updateScope(scope: SharedInstanceState, partial: Partial<CanvasState>): void {
    scope.stateSubject.next({ ...scope.stateSubject.value, ...partial });
  }

  // ===== Screenshot Configuration =====

  setScreenshotEnabled(enabled: boolean): void {
    this.updateState({ screenshotEnabled: enabled });
    this.logger.info(`📸 Screenshot ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** Preview image handed in by the host page (`preview-image` attribute). */
  setPreviewImage(url: string): void {
    this.updateState({ previewImageUrl: url });
  }

  setScreenshotMethod(method: 'pageshot' | 'playwright'): void {
    this.updateState({ screenshotMethod: method });
    this.logger.info(`📸 Screenshot method: ${method}`);
  }

  // ===== Extraction =====

  /** Runs an extraction of `userText`; true once its result is in the form. */
  async startExtraction(userText: string): Promise<boolean> {
    const { run, response } = await this.extractOnForm({ mode: 'text', value: userText });
    if (!response) return this.takenOverSuccessfully(run);

    // Text mode: if ccm:wwwurl found and screenshot enabled, capture screenshot asynchronously
    const afterState = this.getCurrentState();
    if (afterState.screenshotEnabled && !afterState.previewImageUrl) {
      const wwwurl = response.metadata?.['ccm:wwwurl'];
      const targetUrl = Array.isArray(wwwurl) ? wwwurl[0] : wwwurl;
      if (targetUrl && typeof targetUrl === 'string' && targetUrl.startsWith('http')) {
        this.logger.info(`📸 Text mode: URL found in metadata (ccm:wwwurl), capturing screenshot: ${targetUrl}`);
        // Fire-and-forget: capture screenshot in background, don't block extraction
        this.captureScreenshotAsync(targetUrl, afterState.screenshotMethod);
      }
    }
    return true;
  }

  async startUrlExtraction(url: string): Promise<void> {
    await this.extractOnForm({ mode: 'url', value: url });
  }

  async startNodeIdExtraction(nodeId: string): Promise<void> {
    await this.extractOnForm({ mode: 'node', value: nodeId });
  }

  /**
   * An extraction on top of the current form: its values go along as
   * existing metadata (re-extraction); an empty form is built from the core
   * schema first.
   */
  private extractOnForm(input: RunInput): Promise<{ run: number; response: GenerateResponse | null }> {
    this.forgetPreviousForm(); // a new source: the form before it is history (M4)
    const existingMetadata = collectMetadata(this.getCurrentState(), this.shapeExpander);
    // Existing data are field values. A source text alone is none: the text of
    // a run that failed made the next attempt a correction round, which
    // builds no core fields (audit 14.11., W-33).
    const fieldKeys = Object.keys(existingMetadata).filter(k => !k.startsWith('_'));
    const hasExistingData = fieldKeys.length > 0;
    if (hasExistingData) {
      this.logger.debug('Re-extraction with existing metadata:', fieldKeys.length, 'field keys');
    }
    return this.runExtraction(input, {
      startState: input.mode === 'text' ? { userText: input.value } : {},
      existingMetadata: hasExistingData ? existingMetadata : undefined,
      beforeRequest: run => this.ensureCoreFields(run, hasExistingData),
    });
  }

  /**
   * The core fields for a run: built anew for an empty form, and for a form
   * with values whenever they are missing (their schema failed to load when
   * the form was built) - a result without them has no title to show (W-33).
   */
  private async ensureCoreFields(run: number, keepForm: boolean): Promise<void> {
    if (keepForm && this.getCurrentState().coreFields.length > 0) return;
    await this.initializeCoreFields(run, keepForm);
  }

  /** The request fields that name the source of an extraction. */
  private sourceRequest(input: RunInput): GenerateRequest {
    switch (input.mode) {
      case 'url': {
        const state = this.getCurrentState();
        const request: GenerateRequest = {
          input_source: 'url',
          text: '',
          source_url: input.value,
          extraction_method: 'browser',
          normalize: true,
        };
        // Include screenshot request if enabled (captured in parallel by API)
        if (state.screenshotEnabled) {
          request.screenshot_method = state.screenshotMethod;
          request.preview_url = input.value;
          this.logger.info(`📸 Screenshot requested: ${state.screenshotMethod}`);
        }
        return request;
      }
      case 'node':
        return { input_source: 'node_id', text: '', node_id: input.value, normalize: true };
      default:
        return { text: input.value };
    }
  }

  /**
   * What every extraction shares (text, URL, node ID, type switch): a new run
   * with its spinner, one /generate call, the answer into the form, and the
   * failure as a message. After every await the run checks that nothing newer
   * took over (L-01); an overtaken run sends nothing and writes nothing.
   *
   * - `beforeRequest`: builds what the form needs before the call.
   * - `beforeApply`: rebuilds the form once a usable answer is there.
   * - `schemaFile`: the type to generate for; otherwise the selected one.
   */
  private async runExtraction(input: RunInput, plan: {
    startState?: Partial<CanvasState>;
    existingMetadata?: Record<string, any>;
    schemaFile?: string;
    beforeRequest?: (run: number) => Promise<void>;
    beforeApply?: (run: number) => Promise<void>;
  }): Promise<{ run: number; response: GenerateResponse | null }> {
    this.logger.group(`🚀 Extraction (${input.mode}, API)`);
    this.logger.info(input.mode === 'text' ? `Input text length: ${input.value.length} chars` : `Source: ${input.value}`);

    const run = this.startRun();
    // The run ends in the scope it started in, also when this element is bound
    // to another instance meanwhile: elements still bound there stop spinning (#23).
    const scope = this.shared;
    const abort = new AbortController();
    scope.runAbort = abort;
    // What a failed run puts back: its text is no source of the form, and the
    // input of the run before stays the one a type choice runs again (W-33).
    const before = { userText: this.getCurrentState().userText, runInput: scope.runInput };
    scope.runBefore = before; // for cancelExtraction()
    this.shared.runInput = input;
    this.updateState({
      ...plan.startState,
      isExtracting: true,
      extractionProgress: 0,
      extractionError: null,
      extractionWarning: null
    });

    try {
      if (plan.beforeRequest) {
        await plan.beforeRequest(run);
        if (run !== this.generation) return { run, response: null };
      }

      const response = await this.api.generate({
        ...this.sourceRequest(input),
        context: this.schema.getContextName(),
        version: this.schema.getVersion(),
        language: this.i18n.currentLang,
        include_core: true,
        enable_geocoding: true,
        existing_metadata: plan.existingMetadata,
        schema_file: plan.schemaFile ?? (this.getCurrentState().selectedContentType || undefined)
      }, abort.signal);

      if (run !== this.generation) return { run, response: null };
      assertUsable(response, this.i18n);
      if (plan.beforeApply) {
        await plan.beforeApply(run);
        if (run !== this.generation) return { run, response: null };
      }
      await this.applyGeneratedMetadata(response, run);
      if (run !== this.generation) return { run, response: null };
      this.reportGenerationWarning(response);

      this.logger.info(`Extraction completed: ${response.processing.fields_extracted}/${response.processing.fields_total} fields`);
      return { run, response };
    } catch (error: any) {
      // Aborted because something took over or the widget is gone: no failure
      // to tell the editor about (W-PERF-01).
      if (abort.signal.aborted) return { run, response: null };
      this.logger.error('Extraction failed:', error);
      if (run === scope.generation) {
        scope.runInput = before.runInput;
        this.updateScope(scope, { extractionError: describeFailure(error, this.i18n), userText: before.userText });
      }
      return { run, response: null };
    } finally {
      if (scope.runAbort === abort) scope.runAbort = null;
      if (scope.runBefore === before) scope.runBefore = null;
      this.ngZone.run(() => {
        if (run === scope.generation) {
          this.updateScope(scope, { isExtracting: false, extractionProgress: 100 });
        }
      });
      this.logger.groupEnd();
    }
  }

  // ===== Apply API Response to Fields =====

  private async applyGeneratedMetadata(response: GenerateResponse, run: number): Promise<void> {
    const state = this.getCurrentState();
    const metadata = response.metadata || {};

    this.logger.debug('API Response metadata:', metadata);

    // Prepare content-type update (batched into a single updateState below)
    let contentTypeUpdate: Partial<CanvasState> = {};
    let preparedSpecialFields: CanvasFieldState[] | null = null;

    if (response.metadataset && response.metadataset !== 'core.json') {
      // Only reload schema if content type changed (skip on re-extraction with same schema
      // to preserve existing field values that may not be in the API response)
      const isNewSchema = state.selectedContentType !== response.metadataset;
      // Also a type whose fields are still missing: its schema failed to load (W-45).
      if (isNewSchema || this.shared.failedSchemas.has(response.metadataset)) {
        // Prepare fields WITHOUT triggering updateState — will be batched below
        preparedSpecialFields = await this.prepareSpecialFields(response.metadataset, run);
        if (run !== this.generation) return;
      }
      
      contentTypeUpdate = this.contentTypeState(response.metadataset);
    }

    // Determine current fields (use newly prepared special fields if schema changed).
    // Read after the await: a language switch meanwhile relabelled them (#25).
    const current = this.getCurrentState();
    const currentCoreFields = current.coreFields || [];
    const currentSpecialFields = preparedSpecialFields ?? (current.specialFields || []);

    // Use _origins from API response to correctly track AI vs user fields
    const origins = response._origins;

    // Update all fields with values from API (with subfield expansion for complex objects).
    // What the editor changed while the request was out wins (L-01).
    const applyResult = (field: CanvasFieldState): CanvasFieldState => {
      const edited = this.editsDuringRun.get(field.fieldId);
      return edited ? this.applyEdit(field, edited) : this.withValueFrom(field, metadata, origins);
    };
    const updatedCoreFields = currentCoreFields.map(applyResult);
    const updatedSpecialFields = currentSpecialFields.map(applyResult);

    const allFields = [...updatedCoreFields, ...updatedSpecialFields];
    const visibleFields = getCountableFields(allFields);
    const filledFields = visibleFields.filter(f => f.status === FieldStatus.FILLED).length;

    // Without internal meta-keys (_origins, _source_text): not exported twice
    const cleanMetadata = withoutInternalKeys(metadata);
    // Only edits of fields the form still has: a field of the type the answer
    // replaced would be exported under the new one.
    const fieldIds = new Set(allFields.map(f => f.fieldId));
    for (const [key, edited] of this.editsDuringRun) {
      if (fieldIds.has(key)) cleanMetadata[key] = edited.value;
    }

    // Build single batched state update (content type + special fields + field values)
    const stateUpdate: any = {
      ...contentTypeUpdate,
      coreFields: updatedCoreFields,
      specialFields: updatedSpecialFields,
      fieldGroups: groupFields(allFields, this.getCurrentState().fieldGroups),
      metadata: cleanMetadata,
      filledFields,
      totalFields: visibleFields.length,
      extractionProgress: 100
    };

    // Keep the source text the API answers with: after a correction round it is
    // the original source (fetched or typed), without the instruction, and it
    // is the context for the next round and the extended text of the upload.
    if (response._source_text) {
      stateUpdate.userText = response._source_text;
      this.shared.runInput = null; // a re-run for another type uses this text (rerunInput)
    }

    // Set preview image URL if returned by API (async screenshot during generation)
    if (response.preview_image_url) {
      stateUpdate.previewImageUrl = response.preview_image_url;
      this.logger.info('📸 Preview image received from API');
    }

    // Single updateState instead of 3 separate calls — avoids intermediate re-renders
    this.updateState(stateUpdate);
  }

  // ===== Collect Current Metadata =====

  // ===== Initialize Fields from Schema =====

  /**
   * Builds the core fields. An empty form starts with them alone; with
   * `keepForm` they join the form that is there (its type fields and the keys
   * of its import), which lacked them (W-33).
   */
  private async initializeCoreFields(run: number, keepForm = false): Promise<void> {
    const coreSchemaFields = await this.schema.getFields('core.json');
    if (!coreSchemaFields || run !== this.generation) return;

    const groups = await this.schema.getGroups('core.json');
    if (run !== this.generation) return;
    const coreFields = this.buildFields(coreSchemaFields, groups, 'Core', 'core.json');

    const state = this.getCurrentState();
    const allFields = keepForm ? [...coreFields, ...state.specialFields] : coreFields;
    const fieldGroups = groupFields(allFields, state.fieldGroups);
    const visibleFields = getCountableFields(allFields);

    this.updateState({
      coreFields: coreFields,
      fieldGroups: fieldGroups,
      totalFields: visibleFields.length,
      ...(keepForm ? {} : { metadata: {} })
    });
  }

  /**
   * Prepare special fields from a content-type schema WITHOUT triggering a state update.
   * Returns the prepared field array, or null if schema couldn't be loaded.
   */
  private async prepareSpecialFields(schemaFile: string, run: number): Promise<CanvasFieldState[] | null> {
    // The core schema is no type of its own: its fields are the core fields (W-L6).
    if (schemaFile === 'core.json') return [];
    let specialSchemaFields: any[] | null;
    try {
      specialSchemaFields = await this.schema.getFields(schemaFile);
    } catch (error) {
      if (run !== this.generation) return null;
      // Reported here so the error shows on every path (type switch, JSON
      // import, a generated result) and the core values of a generation stay.
      // An empty list, not null: null means "keep the current special fields",
      // and those belong to the previous type — exported under the new one,
      // they would be written to the repository as fields of the wrong type.
      this.logger.error(`Content-type schema ${schemaFile} could not be loaded:`, error);
      this.shared.failedSchemas.add(schemaFile);
      const concept = this.schema.getContentTypeConcepts().find(c => c.schema_file === schemaFile);
      this.updateState({
        extractionError: this.i18n.instant('EXTRACTION_RESULT.SCHEMA_UNAVAILABLE', {
          type: concept?.label || schemaFile,
        }),
      });
      return [];
    }
    if (!specialSchemaFields) return null;

    const groups = await this.schema.getGroups(schemaFile);
    if (run !== this.generation) return null;
    // Keys the groups of the special fields (canvas-fields.ts); the badge shows the type label.
    const schemaName = schemaFile.replace('.json', '')
      .split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    return this.buildFields(specialSchemaFields, groups, schemaName, schemaFile);
  }

  /** The form fields of a schema (those the editor is asked for), in the active language. */
  private buildFields(schemaFields: any[], groups: any[], schemaName: string, schemaFile: string): CanvasFieldState[] {
    this.shared.schemaFieldIds.set(schemaFile, new Set(schemaFields.map((field: any) => field.id)));
    this.shared.failedSchemas.delete(schemaFile);
    const language = this.schema.getActiveLanguage();
    const groupInfo: GroupInfo = {
      labels: new Map((groups || []).map((g: any) => [g.id, this.schema.localizeString(g.label, language)])),
      order: new Map((groups || []).map((g: any, index: number) => [g.id, index])),
      icons: new Map((groups || []).map((g: any) => [g.id, g.icon || ''])),
    };
    return schemaFields
      .filter((field: any) => field.system?.ask_user !== false)
      .map((field: any) => this.withObjectForm(
        { ...this.createFieldState(field, schemaName, groupInfo, language), schemaFile }, field));
  }

  /**
   * An object field offers its form from the start (audit 14.11., W-42): it
   * was expanded only when a value arrived, so a field absent from the record
   * was a plain input - into which the editor typed a bare name.
   */
  private withObjectForm(field: CanvasFieldState, definition: any): CanvasFieldState {
    if (!declaresObjects(definition?.system) && !field.shape) return field;
    const subFields = this.shapeExpander.expandFieldWithShape(field, field.value, definition);
    return subFields.length > 0 ? { ...field, isParent: true, subFields } : field;
  }

  private async loadSpecialSchema(schemaFile: string, run: number): Promise<void> {
    const specialFields = await this.prepareSpecialFields(schemaFile, run);
    if (!specialFields || run !== this.generation) return;

    const state = this.getCurrentState();
    const allFields = [...state.coreFields, ...specialFields];
    const fieldGroups = groupFields(allFields, this.getCurrentState().fieldGroups);
    const visibleFields = getCountableFields(allFields);

    this.updateState({
      specialFields: specialFields,
      fieldGroups: fieldGroups,
      totalFields: visibleFields.length
    });
  }

  private createFieldState(field: any, schemaName: string, groups: GroupInfo, language: string): CanvasFieldState {
    const groupId = field.group || 'other';
    const groupLabel = this.schema.localizeString(field.group_label, language)
      || groups.labels.get(groupId)
      || this.schema.getFallbackGroupLabel(language);
    const groupOrder = groups.order.get(groupId) ?? 999;
    const groupIcon = groups.icons.get(groupId) || '';
    const localizedField = this.schema.localizeFieldFull(field, language);

    return {
      fieldId: field.id,
      uri: field.system?.uri || field.id,
      group: groupId,
      groupLabel: String(groupLabel),
      groupIcon: groupIcon,
      groupOrder: groupOrder,
      schemaName: schemaName,
      aiFillable: field.system?.ai_fillable !== false,
      repoField: field.system?.repo_field !== false,
      label: localizedField.label,
      description: localizedField.description,
      value: field.system?.multiple ? [] : null,
      status: FieldStatus.EMPTY,
      confidence: 0,
      isRequired: field.system?.required || false,
      datatype: field.system?.datatype || 'string',
      itemDatatype: field.system?.items?.datatype,
      objectKey: objectKeyFor(field.system),
      multiple: field.system?.multiple || false,
      vocabulary: localizedField.vocabulary,
      validation: field.system?.validation,
      shape: field.system?.items?.shape,
      examples: localizedField.examples,
      prompt: localizedField.prompt
    };
  }

  // ===== Language Switch =====

  /**
   * Relabel the form in the current language (audit U-04). Labels, group names
   * and vocabulary labels are localized when the fields are built, so a switch
   * left them in the old language until the next extraction rebuilt the form.
   * Values and their origins stay as they are.
   */
  async relocalizeFields(): Promise<void> {
    const language = this.schema.getActiveLanguage();
    const selected = this.getCurrentState().selectedContentType;
    const relabelCore = await this.relabeler('core.json', language);
    const relabelSpecial = selected && selected !== 'core.json'
      ? await this.relabeler(selected, language)
      : (field: CanvasFieldState) => field;
    // A newer switch, or a form that changed type meanwhile, relabels on its own.
    if (this.schema.getActiveLanguage() !== language || this.getCurrentState().selectedContentType !== selected) return;

    const state = this.getCurrentState();
    const coreFields = state.coreFields.map(relabelCore);
    const specialFields = state.specialFields.map(relabelSpecial);
    const concept = this.schema.getContentTypeConcepts().find(c => c.schema_file === state.selectedContentType);
    this.updateState({
      coreFields,
      specialFields,
      fieldGroups: groupFields([...coreFields, ...specialFields], state.fieldGroups),
      ...(concept ? { contentTypeLabel: concept.label } : {})
    });
  }

  /** Maps a field of `schemaFile` to the same field with labels in `language`. */
  private async relabeler(schemaFile: string, language: string): Promise<(field: CanvasFieldState) => CanvasFieldState> {
    let definitions: any[] | null;
    let groups: any[];
    try {
      definitions = await this.schema.getFields(schemaFile);
      groups = await this.schema.getGroups(schemaFile);
    } catch {
      return field => field; // labels stay in the old language rather than the form breaking
    }
    const byId = new Map((definitions || []).map((d: any) => [d.id, d]));
    const groupMap = new Map((groups || []).map((g: any) => [g.id, this.schema.localizeString(g.label, language)]));

    return (field: CanvasFieldState): CanvasFieldState => {
      const definition = byId.get(field.fieldId);
      if (!definition) return field;
      const localized = this.schema.localizeFieldFull(definition, language);
      const relabelled: CanvasFieldState = {
        ...field,
        label: localized.label,
        description: localized.description,
        vocabulary: localized.vocabulary,
        examples: localized.examples,
        prompt: localized.prompt,
        groupLabel: String(this.schema.localizeString(definition.group_label, language)
          || groupMap.get(field.group)
          || this.schema.getFallbackGroupLabel(language))
      };
      if (!field.isParent || !field.subFields) return relabelled;
      // Subfield labels come from the shape: expand again in the new language,
      // keeping each subfield's own origin (the editor may have changed one).
      // From the entries of the form, not from the value: that leaves out the
      // entry forms the editor has not filled yet (W-42).
      return this.withEntries(relabelled, this.shapeExpander.objectEntries(field));
    };
  }

  // ===== Manual Field Updates =====

  updateFieldValue(fieldId: string, value: any): void {
    const state = this.getCurrentState();

    const updateField = (f: CanvasFieldState): CanvasFieldState => {
      // Direct match on top-level field. The same value again is no edit (a
      // field emits on blur): it neither turns an AI value into the editor's
      // nor shields the field from the running request (L-01).
      if (f.fieldId === fieldId) {
        if (sameValue(f.value, value)) return f;
        // An object field takes the value into its form: the record is put
        // together from the subfields, not read from `value` (W-31).
        if (f.isParent && f.subFields) return this.applyValueToField(f, value, false);
        const isFilled = isValueFilled(value);
        return {
          ...f,
          value: value,
          status: isFilled ? FieldStatus.FILLED : FieldStatus.EMPTY,
          isAiGenerated: false
        };
      }
      // Check subfields of parent fields
      if (f.isParent && f.subFields) {
        const updatedSubs = f.subFields.map(sf => {
          if (sf.fieldId === fieldId && !sameValue(sf.value, value)) {
            return {
              ...sf,
              value: value,
              status: isValueFilled(value) ? FieldStatus.FILLED : FieldStatus.EMPTY,
              isAiGenerated: false
            };
          }
          return sf;
        });
        const subChanged = updatedSubs.some((sf, i) => sf !== f.subFields![i]);
        if (subChanged) {
          return this.editedObjectField({ ...f, subFields: updatedSubs });
        }
      }
      return f;
    };
    
    const updatedCoreFields = state.coreFields.map(updateField);
    const updatedSpecialFields = state.specialFields.map(updateField);
    const allFields = [...updatedCoreFields, ...updatedSpecialFields];
    const before = [...state.coreFields, ...state.specialFields];
    const known = before.some(f => f.fieldId === fieldId || f.subFields?.some(sf => sf.fieldId === fieldId));
    if (known && allFields.every((f, i) => f === before[i])) return; // the same value again
    const visibleFields = getCountableFields(allFields);
    const filledFields = visibleFields.filter(f => f.status === FieldStatus.FILLED).length;

    if (state.isExtracting) {
      // Remember the changed top-level field (the parent for a subfield) so the
      // answer of the running request does not overwrite it (L-01).
      allFields.forEach((f, i) => {
        if (f !== before[i]) this.editsDuringRun.set(f.fieldId, f);
      });
    }

    // For subfield updates, also update the parent's metadata entry
    const metadata = { ...state.metadata };
    for (const f of allFields) {
      if (f.isParent && f.subFields?.some(sf => sf.fieldId === fieldId)) {
        metadata[f.fieldId] = f.value;
      }
    }
    metadata[fieldId] = value;

    this.commitEdit({
      coreFields: updatedCoreFields,
      specialFields: updatedSpecialFields,
      fieldGroups: groupFields(allFields, this.getCurrentState().fieldGroups),
      metadata,
      filledFields,
      totalFields: visibleFields.length
    });
  }

  /** A state change that is the editor's edit; see `isEdit`. */
  private commitEdit(partial: Partial<CanvasState>): void {
    const scope = this.shared;
    scope.editing = true;
    try {
      this.updateScope(scope, partial);
    } finally {
      scope.editing = false;
    }
  }

  /**
   * True while the state being delivered to the subscribers is an edit of
   * the editor: it is reported to the host in the same task (W-36).
   */
  get isEdit(): boolean {
    return this.shared.editing;
  }

  /**
   * An object field whose subfields the editor changed: its value is put
   * together from them, and status and origin follow like those of any edited
   * field (audit 14.11., W-32). Both stayed as they were - the next AI run
   * was told the object is the AI's and replaced it, and an object typed into
   * an empty field left the field "empty".
   */
  private editedObjectField(field: CanvasFieldState): CanvasFieldState {
    const value = this.shapeExpander.reconstructObjectFromSubFields(field, []);
    return {
      ...field,
      value,
      status: isValueFilled(value) ? FieldStatus.FILLED : FieldStatus.EMPTY,
      isAiGenerated: false
    };
  }

  // ===== Entries of an Object List =====

  /**
   * Adds an empty entry form to an object list field (schema:location of an
   * event with two venues). The value does not change until the editor fills
   * the entry: an empty entry is not part of the record (W-42).
   */
  addObjectEntry(fieldId: string): void {
    this.changeObjectField(fieldId, field =>
      field.multiple ? this.withEntries(field, [...this.shapeExpander.objectEntries(field), {}]) : field);
  }

  /**
   * Removes the entry at `index` (the `arrayIndex` of its subfields) from an
   * object field; the entries after it move up, and the last one leaves its
   * empty form behind. Removing an entry with content is an edit like any
   * other: the field is the editor's from then on. An empty entry form goes
   * without a trace in the record (W-42).
   */
  removeObjectEntry(fieldId: string, index: number): void {
    this.changeObjectField(fieldId, field => {
      const entries = this.shapeExpander.objectEntries(field);
      if (index < 0 || index >= entries.length) return field;
      const before = (at: number) => (at < index ? at : at + 1); // where the entry now at `at` stood
      const rebuilt = this.withEntries(field, entries.filter((_, at) => at !== index), before);
      return isValueFilled(entries[index]) ? this.editedObjectField(rebuilt) : rebuilt;
    });
  }

  /**
   * The object field with the form rebuilt for `entries`. Each subfield keeps
   * the origin it had; `positionBefore` says where an entry stood.
   */
  private withEntries(
    field: CanvasFieldState,
    entries: any[],
    positionBefore: (index: number) => number = index => index
  ): CanvasFieldState {
    const definition = this.schema.getFieldById(field.fieldId, field.schemaFile);
    const origin = new Map((field.subFields || []).map(sf => [`${sf.arrayIndex || 0} ${sf.path}`, sf.isAiGenerated]));
    const subFields = this.shapeExpander
      .expandFieldWithShape(field, field.multiple ? entries : entries[0], definition)
      .map(sf => ({ ...sf, isAiGenerated: origin.get(`${positionBefore(sf.arrayIndex || 0)} ${sf.path}`) }));
    return { ...field, subFields };
  }

  /**
   * Applies `change` to the object field `fieldId`. A change of its value
   * during a run is kept against the answer, like a typed one (L-01).
   */
  private changeObjectField(fieldId: string, change: (field: CanvasFieldState) => CanvasFieldState): void {
    const state = this.getCurrentState();
    const before = [...state.coreFields, ...state.specialFields].find(f => f.fieldId === fieldId);
    if (!before?.isParent || !before.subFields) return;
    const changed = change(before);
    if (changed === before) return;
    const apply = (f: CanvasFieldState) => (f === before ? changed : f);
    const coreFields = state.coreFields.map(apply);
    const specialFields = state.specialFields.map(apply);
    const allFields = [...coreFields, ...specialFields];
    if (state.isExtracting && !sameValue(changed.value, before.value)) {
      this.editsDuringRun.set(fieldId, changed);
    }

    const visibleFields = getCountableFields(allFields);
    this.commitEdit({
      coreFields,
      specialFields,
      fieldGroups: groupFields(allFields, state.fieldGroups),
      filledFields: visibleFields.filter(f => f.status === FieldStatus.FILLED).length,
      totalFields: visibleFields.length
    });
  }

  // ===== Content Type Selection =====

  /**
   * Switch to a content type; false if another action overtook it meanwhile.
   * `onApplied` is called once the type and its fields are in the form, before
   * a re-run for it (which can take as long as a /generate call).
   */
  async selectContentType(schemaFileOrUri: string, onApplied?: () => void): Promise<boolean> {
    // A choice still loading its schema has already ended the spinner of the
    // run it cut short; one made meanwhile takes that interruption over.
    const interrupted = this.getCurrentState().isExtracting ? this.generation : this.shared.pendingTakeover;
    const choice = this.chooseContentType(schemaFileOrUri, interrupted !== null, onApplied);
    // Registered before the first await: the replaced run looks it up as soon
    // as it notices it was overtaken (#24).
    if (interrupted !== null) {
      this.shared.takeovers.set(interrupted, choice.then(c => c.rerun));
    }
    return (await choice).current;
  }

  /**
   * Whether the run a type choice put in place of `run` (or one that replaced
   * that one in turn) brought its result into the form (#24).
   */
  private async takenOverSuccessfully(run: number): Promise<boolean> {
    const rerun = await this.shared.takeovers.get(run);
    if (!rerun) return false;
    return rerun.succeeded || this.takenOverSuccessfully(rerun.run);
  }

  private async chooseContentType(
    schemaFileOrUri: string,
    interruptedExtraction: boolean,
    onApplied?: () => void
  ): Promise<{ current: boolean; rerun: RunOutcome | null }> {
    // Resolve URI to schema filename if needed
    const schemaFile = this.schema.resolveSchemaFileOrUri(schemaFileOrUri);
    const run = this.supersede();
    this.shared.pendingTakeover = interruptedExtraction ? run : null;

    const state = this.getCurrentState();

    // Save current field values to cache before switching
    const currentCt = state.selectedContentType;
    if (currentCt) {
      this.cacheFieldValues(currentCt, state);
    }
    
    // Load schema and update UI
    await this.loadSpecialSchema(schemaFile, run);
    // Overtaken: a later choice may take the interruption over (pendingTakeover).
    if (run !== this.generation) return { current: false, rerun: { run, succeeded: false } };
    this.shared.pendingTakeover = null;
        
    // The values of the new type's fields: what the form showed for the ids
    // both types have, and what is cached for this type.
    this.restoreFieldValues(schemaFile, state.specialFields);

    this.updateState(this.contentTypeState(schemaFile));
    onApplied?.();
    
    // If there is a source and no cached data for this type, regenerate - also
    // when the choice cut an extraction short: its request stands, for this
    // type, whatever is cached (the cache does not hold that run's result).
    const hasExistingData = state.filledFields > 0;
    // An entry without values (all emptied) counts as nothing cached, as before.
    const cached = Object.keys(this.fieldValueCache.get(schemaFile)?.values ?? {}).length > 0;
    if (this.rerunInput() && (interruptedExtraction || (hasExistingData && !cached))) {
      this.logger.info(`Content type changed to ${schemaFile}, regenerating...`);
      const rerun = await this.regenerateWithContentType(schemaFile);
      return { current: rerun?.run === this.generation, rerun };
    }
    return { current: true, rerun: null };
  }

  private cacheFieldValues(schemaFile: string, state: CanvasState): void {
    const values: Record<string, any> = {};
    const origins: Record<string, boolean> = {};
    
    // Cache special fields
    for (const field of state.specialFields) {
      if (field.status === FieldStatus.FILLED) {
        values[field.fieldId] = field.value;
        origins[field.fieldId] = field.isAiGenerated || false;
      }
      // Also cache subfield values
      if (field.subFields) {
        for (const sf of field.subFields) {
          if (sf.status === FieldStatus.FILLED) {
            values[sf.fieldId] = sf.value;
            origins[sf.fieldId] = sf.isAiGenerated || false;
          }
        }
      }
    }
    
    // Also when nothing is filled: an older entry would bring back what the
    // editor emptied (W-L5).
    this.fieldValueCache.set(schemaFile, { values, origins });
    this.logger.info(`Cached ${Object.keys(values).length} field values for ${schemaFile}`);
  }

  /**
   * Fills the fields of the type just chosen. A field id the type shares with
   * the one before (`previous`: 44 ids of the 2.0.0 schemas, licence keys
   * among them) keeps what the form showed, origin included - the record is
   * built from the fields, so it showed a value the new form lacked, or lost
   * one the editor had typed (audit 14.11., W-31). The other fields get the
   * values cached for the type, otherwise those of an import without a type
   * of its own (F2).
   */
  private restoreFieldValues(schemaFile: string, previous: CanvasFieldState[]): void {
    const cached = this.fieldValueCache.get(schemaFile) ?? this.shared.importedValues ?? { values: {}, origins: {} };
    const shownBefore = new Map(previous.map(field => [field.fieldId, field]));
    if (shownBefore.size === 0 && Object.keys(cached.values).length === 0) return;

    const state = this.getCurrentState();

    const restoredSpecialFields = state.specialFields.map(field => {
      const shown = shownBefore.get(field.fieldId);
      if (shown) return shown === field ? field : this.carriedOver(field, shown);
      const cachedValue = cached.values[field.fieldId];
      if (cachedValue !== undefined) {
        const isAi = cached.origins[field.fieldId] || false;
        let updated = this.applyValueToField(field, cachedValue, isAi);
        // Also restore subfield values
        if (updated.subFields) {
          updated = {
            ...updated,
            subFields: updated.subFields.map(sf => {
              const sfValue = cached.values[sf.fieldId];
              if (sfValue !== undefined) {
                return this.applyValueToField(sf, sfValue, cached.origins[sf.fieldId] || false);
              }
              return sf;
            })
          };
        }
        return updated;
      }
      return field;
    });
    
    const allFields = [...state.coreFields, ...restoredSpecialFields];
    const visibleFields = getCountableFields(allFields);
    const filledFields = visibleFields.filter(f => f.status === FieldStatus.FILLED).length;
    
    // Update metadata
    const metadata = { ...state.metadata };
    for (const [key, val] of Object.entries(cached.values)) {
      metadata[key] = val;
    }
    
    this.updateState({
      specialFields: restoredSpecialFields,
      fieldGroups: groupFields(allFields, this.getCurrentState().fieldGroups),
      metadata,
      filledFields,
      totalFields: visibleFields.length
    });
    
    this.logger.info(`Restored ${Object.keys(cached.values).length} cached field values for ${schemaFile}`);
  }

  /** The new type's `field` with the value, status and origins of the field `shown` for the same id. */
  private carriedOver(field: CanvasFieldState, shown: CanvasFieldState): CanvasFieldState {
    // Without a value, "emptied by the editor" still travels with the origin.
    if (!isValueFilled(shown.value)) return { ...field, isAiGenerated: shown.isAiGenerated };
    const applied = this.applyValueToField(field, shown.value, shown.isAiGenerated ?? false);
    if (!applied.subFields || !shown.subFields) return applied;
    const origin = new Map(shown.subFields.map(sf => [sf.fieldId, sf.isAiGenerated]));
    return {
      ...applied,
      subFields: applied.subFields.map(sf => ({ ...sf, isAiGenerated: origin.get(sf.fieldId) ?? sf.isAiGenerated }))
    };
  }

  /**
   * What a run for another type extracts from: the URL or node ID of the run
   * that is out (or that brought no text back), otherwise the text - after a
   * run that is the source text the agent answered with.
   */
  private rerunInput(): RunInput | null {
    const input = this.shared.runInput;
    if (input && input.mode !== 'text') return input;
    const text = this.getCurrentState().userText;
    return text ? { mode: 'text', value: text } : null;
  }

  /** New run for a content type; null if there is nothing to run it from. */
  private async regenerateWithContentType(schemaFile: string): Promise<RunOutcome | null> {
    const state = this.getCurrentState();
    const input = this.rerunInput();

    if (!input) return null;

    // The core values go along with their origins, so what the editor typed
    // survives the new run (U-06); so do the values cached for this type, which
    // the choice restored - the run rebuilds the special fields before its
    // request. Not the old type's fields, and not the source text, which would
    // turn the request into a correction round.
    const cached = this.fieldValueCache.get(schemaFile)?.values ?? {};
    const restored = state.specialFields.filter(f => cached[f.fieldId] !== undefined);
    const coreValues = collectMetadata({ ...state, specialFields: restored }, this.shapeExpander);
    delete coreValues['_source_text'];
    const hasCoreValues = Object.keys(coreValues).some(key => !key.startsWith('_'));

    const { run, response } = await this.runExtraction(input, {
      schemaFile,
      existingMetadata: hasCoreValues ? coreValues : undefined,
      // Fields of the new type first. The core values stay until replacements
      // arrive: a failed call must not leave the user with an emptied form.
      beforeRequest: run => this.loadSpecialSchema(schemaFile, run),
      // Re-initialize fields (clear values) only once the new ones are there
      beforeApply: async run => {
        await this.initializeCoreFields(run);
        if (run !== this.generation) return;
        await this.loadSpecialSchema(schemaFile, run);
      },
    });
    return { run, succeeded: response !== null };
  }

  // ===== Load Existing Metadata =====

  /** Replaces the form with the given metadata; false if another action superseded it meanwhile. */
  async loadMetadata(metadata: Record<string, any>, schemaFile?: string, origins?: Record<string, 'ai' | 'user'>, options?: { skipCore?: boolean }): Promise<boolean> {
    this.logger.info('Loading existing metadata', origins ? '(with origins)' : '(no origins)');
    const run = this.supersede();
    this.shared.runInput = null; // the loaded form's source is its own text, not the last run's
    this.forgetPreviousForm();
    // Messages about the form being replaced go with it; this one's follow.
    this.shared.failedSchemas.clear();
    this.updateState({ extractionError: null, extractionWarning: null });

    // Initialize core fields unless explicitly skipped
    if (!options?.skipCore) {
      try {
        await this.initializeCoreFields(run);
      } catch (err) {
        if (run !== this.generation) return false;
        // Shown, not only logged: the form comes up without title and
        // description, and nothing said why (audit 14.11., W-45).
        this.logger.warn('Core schema not available, continuing without core fields');
        this.shared.failedSchemas.add('core.json');
        const cause = failureCause(err, this.i18n);
        this.updateState({
          coreFields: [],
          extractionError: translated(this.i18n, 'ALERTS.SCHEMA_INIT_FAILED', { error: cause },
            `The fields could not be loaded: ${cause}`),
        });
      }
      if (run !== this.generation) return false;
    }

    // Resolve URI to schema filename if needed - after the core schema, which
    // holds the URIs (an import at page start comes before it was loaded).
    if (schemaFile) {
      schemaFile = this.schema.resolveSchemaFileOrUri(schemaFile);
    }

    if (schemaFile && schemaFile !== 'core.json') {
      await this.loadSpecialSchema(schemaFile, run);
      if (run !== this.generation) return false;

      // Set content type label and icon so UI (floating buttons) reflects the loaded type
      this.updateState(this.contentTypeState(schemaFile));
    } else {
      // No type of its own: the previous type's fields would be exported with it.
      this.updateState({ specialFields: [], ...this.contentTypeState(null) });
    }

    const state = this.getCurrentState();
    
    const updatedCoreFields = state.coreFields.map(field => this.withValueFrom(field, metadata, origins));
    const updatedSpecialFields = state.specialFields.map(field => this.withValueFrom(field, metadata, origins));

    const allFields = [...updatedCoreFields, ...updatedSpecialFields];
    const visibleFields = getCountableFields(allFields);
    const filledFields = visibleFields.filter(f => f.status === FieldStatus.FILLED).length;

    // Without internal meta-keys (_origins, _source_text): not exported twice
    const cleanMetadata = withoutInternalKeys(metadata);

    this.updateState({
      coreFields: updatedCoreFields,
      specialFields: updatedSpecialFields,
      fieldGroups: groupFields(allFields, this.getCurrentState().fieldGroups),
      metadata: cleanMetadata,
      filledFields,
      totalFields: visibleFields.length
    });
    
    // Cache loaded values so switching content types and back preserves them
    if (schemaFile && schemaFile !== 'core.json') {
      const afterState = this.getCurrentState();
      this.cacheFieldValues(schemaFile, afterState);
    }
    return true;
  }

  /** The state that names a type; core.json and none mean no type of its own. */
  private contentTypeState(schemaFile: string | null): Partial<CanvasState> {
    if (!schemaFile || schemaFile === 'core.json') {
      return { detectedContentType: null, selectedContentType: null, contentTypeLabel: undefined, contentTypeIcon: undefined };
    }
    const concept = this.schema.getContentTypeConcepts().find(c => c.schema_file === schemaFile);
    return {
      detectedContentType: schemaFile,
      selectedContentType: schemaFile,
      contentTypeLabel: concept?.label || schemaFile.replace('.json', ''),
      contentTypeIcon: concept?.icon || 'category'
    };
  }

  // ===== Export Metadata =====

  /**
   * The record for the events (metadataChange, metadataSubmit) and the JSON
   * export: the form's fields plus the keys an import brought that the form
   * has no field for, as in 2.1.1.
   */
  getMetadataForExport(): Record<string, any> {
    const state = this.getCurrentState();
    const keys = this.recordFieldIds(state);
    for (const key of this.shared.importedKeys) keys.add(key);
    return exportMetadata(state, this.shapeExpander, this.schema, this.i18n.currentLang, keys);
  }

  /**
   * The record for the upload: only the fields of the core schema and the
   * selected type - it is written to ccm:oeh_extendedData (W-L1).
   */
  getMetadataForRepository(): Record<string, any> {
    const state = this.getCurrentState();
    return exportMetadata(state, this.shapeExpander, this.schema, this.i18n.currentLang, this.recordFieldIds(state));
  }

  /**
   * Whether the form lacks the fields of a schema that could not be loaded -
   * the core schema or the selected type. Such a form is not uploaded: the
   * record would go to the repository without them (audit 14.11., W-45).
   */
  hasSchemaError(): boolean {
    const type = this.getCurrentState().selectedContentType;
    return this.shared.failedSchemas.has('core.json') || (!!type && this.shared.failedSchemas.has(type));
  }

  /** Ids of all fields of the core schema and the selected type, as built for this form. */
  private recordFieldIds(state: CanvasState): Set<string> {
    const ids = new Set(this.shared.schemaFieldIds.get('core.json'));
    const type = state.selectedContentType;
    for (const id of (type && this.shared.schemaFieldIds.get(type)) || []) ids.add(id);
    return ids;
  }

  // ===== Async Screenshot Capture =====

  /**
   * Capture a screenshot in the background and update preview image when done.
   * Fire-and-forget: does not block UI or extraction flow.
   */
  private captureScreenshotAsync(url: string, method: 'pageshot' | 'playwright'): void {
    const run = this.generation;
    this.api.captureScreenshot(url, method).then(dataUrl => {
      // After a reset or a newer extraction this is the old page's picture.
      if (dataUrl && run === this.generation) {
        this.ngZone.run(() => {
          this.updateState({ previewImageUrl: dataUrl });
          this.logger.info('📸 Screenshot loaded into preview');
        });
      }
    }).catch(err => {
      this.logger.warn('📸 Async screenshot failed:', err);
    });
  }

  // ===== Error Management =====

  setError(message: string): void {
    this.updateState({ extractionError: message });
  }

  clearError(): void {
    this.updateState({ extractionError: null });
  }

  clearWarning(): void {
    this.updateState({ extractionWarning: null });
  }

  /**
   * Say so when a result is usable but incomplete or uncertain: failed fields
   * or a content type that only the keyword fallback picked. Never silent -
   * a guessed type used to look exactly like a detected one.
   */
  private reportGenerationWarning(response: GenerateResponse): void {
    this.updateState({ extractionWarning: generationWarning(response, this.i18n, this.schema) });
  }

  /** What belonged to the form being replaced: values cached per type, run takeovers. */
  private forgetPreviousForm(): void {
    this.fieldValueCache.clear();
    this.shared.importedValues = null;
    this.shared.importedKeys = new Set();
    this.shared.takeovers.clear(); // runs it replaces are no success of theirs
    this.shared.pendingTakeover = null;
  }

  // ===== Reset =====

  /**
   * Takes over the scope: from now on only the returned number is current.
   * A request still out is aborted - its answer would be dropped anyway, and
   * the agent would work on it for up to 300 s (W-PERF-01).
   */
  private nextGeneration(): number {
    this.shared.runAbort?.abort();
    this.shared.runAbort = null;
    this.shared.generation = ++CanvasService.runSequence;
    return this.shared.generation;
  }

  /** Number of a new run; edits protected for an earlier run are history now. */
  private startRun(): number {
    this.editsDuringRun.clear();
    return this.nextGeneration();
  }

  /**
   * Start an action that replaces the form (type choice, loading, import):
   * whatever still runs answers into the void (L-01), and its spinner goes.
   */
  private supersede(): number {
    const run = this.nextGeneration();
    if (this.getCurrentState().isExtracting) {
      this.updateState({ isExtracting: false });
    }
    return run;
  }

  /**
   * The editor stops the running extraction ("Abbrechen" in the progress line,
   * audit 14.11., K-23): its request is aborted like on a reset, its answer
   * goes nowhere, and the form stays as it is. Nothing to do without a run.
   *
   * Its text and input go like those of a failed run (W-33), and at once - the
   * aborted request fails later, when something else may have started: the
   * upload sent the cancelled text as extended text, and a type choice ran the
   * cancelled source again (audit 14.11., open point of the UI strand).
   */
  cancelExtraction(): void {
    if (!this.getCurrentState().isExtracting) return;
    const before = this.shared.runBefore;
    this.supersede();
    if (!before) return;
    this.shared.runBefore = null;
    this.shared.runInput = before.runInput;
    this.updateState({ userText: before.userText });
  }

  reset(): void {
    this.nextGeneration(); // whatever is still running answers into the void
    this.shared.runInput = null;
    this.forgetPreviousForm();
    this.shared.failedSchemas.clear();
    this.stateSubject.next(createInitialState());
    this.logger.info('Canvas state reset');
  }

  // ===== Content Type Change =====

  async changeContentTypeManually(schemaFileOrUri: string, label?: string, icon?: string, onApplied?: () => void): Promise<void> {
    if (!(await this.selectContentType(schemaFileOrUri, onApplied))) return;
    if (label) {
      this.updateState({ contentTypeLabel: label });
    }
    if (icon) {
      this.updateState({ contentTypeIcon: icon });
    }
  }

  // ===== JSON Import =====

  /**
   * Replaces the form with imported metadata. Without a metadataset of its own
   * the import takes `hostContentType`, the type the host page set (content-type),
   * as in 2.1.1 (F2); without that it has no type - the previous page's type
   * and its fields are not kept. Its values then wait for a type chosen later.
   */
  async importJsonData(data: unknown, hostContentType?: string | null): Promise<void> {
    this.logger.info('Importing JSON data');
    // Refused before anything changes: the form stays as it was (W-34).
    const record = readRecord(data);
    const scope = this.shared;
    scope.importsRunning++;
    try {
      await this.importRecord(record, hostContentType);
    } finally {
      scope.importsRunning--;
      // Once more for the elements of the instance: the one that reports the
      // record waits until no import is running (W-35).
      scope.stateSubject.next({ ...scope.stateSubject.value });
    }
  }

  /** True while an import builds its form: its steps are not reported to the host. */
  get importRunning(): boolean {
    return this.shared.importsRunning > 0;
  }

  /** Whether an import finished since the last report; asking counts as that report. */
  takeFinishedImport(): boolean {
    const finished = this.shared.importFinished;
    this.shared.importFinished = false;
    return finished;
  }

  /** The record of the instance's last metadataChange, as the elements compare it (W-48). */
  get reportedRecord(): string | undefined {
    return this.shared.reportedRecord;
  }

  set reportedRecord(record: string | undefined) {
    this.shared.reportedRecord = record;
  }

  private async importRecord(record: ImportedRecord, hostContentType?: string | null): Promise<void> {
    const scope = this.shared;
    const { metadata, origins } = record;
    if (!(await this.loadMetadata(metadata, record.schemaFile || hostContentType || undefined, origins))) return;
    if (!record.schemaFile) {
      this.shared.importedValues = importedValues(metadata, origins);
    }
    const fieldIds = this.recordFieldIds(this.getCurrentState());
    this.shared.importedKeys = new Set(Object.keys(withoutInternalKeys(metadata)).filter(key => !fieldIds.has(key)));

    // Source text and preview image of the import (top level or inside metadata
    // for backward compat). Without them, none: the previous page's text would
    // be uploaded as extended_text and re-run for another type, its image
    // exported as preview_image_url.
    this.updateState({
      userText: record.sourceText || '',
      previewImageUrl: record.previewImageUrl || undefined,
      extractionWarning: this.otherSchemaNotice(record),
    });
    if (record.previewImageUrl) {
      this.logger.info('📸 Preview image loaded from imported JSON');
    }
    scope.importFinished = true;
  }

  /**
   * Says so when the record names another context or schema version than the
   * form is built from. The widget shows every record with the schema it has
   * loaded and exports it under that one's name (the record's `language`
   * likewise becomes the widget's); it did so without a word, so opening and
   * saving a record of v1.8.1 quietly made it one of v2.0.0 (audit 14.11., W-44).
   */
  private otherSchemaNotice(record: ImportedRecord): string | null {
    const version = (value: string | undefined) => (value || '').replace(/^v/, '');
    const own = { context: this.schema.getContextName(), version: version(this.schema.getSchemaVersion()) };
    const theirs = { context: record.contextName || own.context, version: version(record.schemaVersion) || own.version };
    // 'latest' names no version: nothing to compare with.
    const versionDiffers = theirs.version !== own.version && theirs.version !== 'latest' && own.version !== 'latest';
    if (theirs.context === own.context && !versionDiffers) return null;
    const params = {
      recordContext: theirs.context, recordVersion: theirs.version,
      context: own.context, version: own.version,
    };
    return translated(this.i18n, 'ALERTS.RECORD_OTHER_SCHEMA', params,
      `This record was made with another schema (${theirs.context} ${theirs.version}). ` +
      `The form shows it with ${own.context} ${own.version} and saves it as such.`);
  }

  // ===== Helper Methods =====

  /** The field with its value from `metadata`, if there is one; from the AI unless the origins say user. */
  private withValueFrom(field: CanvasFieldState, metadata: Record<string, any>, origins?: Record<string, string>): CanvasFieldState {
    const value = metadata[field.fieldId];
    if (value === undefined || value === null) return field;
    const applied = this.applyValueToField(field, value, origins ? origins[field.fieldId] !== 'user' : true);
    if (!origins || !applied.subFields) return applied;
    // A subfield the export names keeps its own origin; the others have their
    // object's. Without this an import made every subfield the AI's or the
    // editor's, whoever had filled it (audit 14.11., W-32).
    return {
      ...applied,
      subFields: applied.subFields.map(sf =>
        origins[sf.fieldId] ? { ...sf, isAiGenerated: origins[sf.fieldId] !== 'user' } : sf)
    };
  }

  /**
   * Apply a value to a field, expanding complex objects into subfields when shape is defined
   */
  private applyValueToField(field: CanvasFieldState, value: any, isAiGenerated = true): CanvasFieldState {
    const schemaFieldDef = this.schema.getFieldById(field.fieldId, field.schemaFile);
    // The SCHEMA decides whether this is an object field — never the value.
    // Deciding from the value meant a string arrived, no subfields were built,
    // `isParent` stayed false, and field.component.html rendered a plain text
    // input (`*ngIf="!field.isParent"`). The editor then typed a name into a
    // field the schema declares as an object, and it went straight through.
    const isComplexObject = declaresObjects(schemaFieldDef?.system) || !!field.shape;

    if (isComplexObject) {
      const subFields = this.shapeExpander.expandFieldWithShape(field, value, schemaFieldDef);
      // Inherit isAiGenerated on all subfields
      const taggedSubFields = subFields.map(sf => ({ ...sf, isAiGenerated }));
      return {
        ...field,
        value: value,
        // [] or {} is no value (L-8): the field counted as filled and in the progress.
        status: isValueFilled(value) ? FieldStatus.FILLED : FieldStatus.EMPTY,
        confidence: 0.9,
        isAiGenerated,
        isParent: taggedSubFields.length > 0,
        subFields: taggedSubFields.length > 0 ? taggedSubFields : undefined
      };
    }

    return {
      ...field,
      value: value,
      status: isValueFilled(value) ? FieldStatus.FILLED : FieldStatus.EMPTY,
      confidence: 0.9,
      isAiGenerated
    };
  }

  /**
   * The editor's own value for a field, also when they emptied it. Of an
   * object only the subfields they changed are theirs; the others keep the
   * origin they had at the edit.
   */
  private applyEdit(field: CanvasFieldState, edited: CanvasFieldState): CanvasFieldState {
    const value = edited.value;
    if (!isValueFilled(value)) {
      return { ...field, value, status: FieldStatus.EMPTY, isAiGenerated: false };
    }
    const applied = this.applyValueToField(field, value, false);
    if (!applied.subFields || !edited.subFields) return applied;
    const origin = new Map(edited.subFields.map(sf => [sf.fieldId, sf.isAiGenerated]));
    return {
      ...applied,
      subFields: applied.subFields.map(sf => ({ ...sf, isAiGenerated: origin.get(sf.fieldId) ?? false }))
    };
  }

  // ===== Content Type Concepts =====

  getContentTypeConcepts(): any[] {
    return this.schema.getContentTypeConcepts();
  }
}

/** The values of an import (without internal keys) with whether each came from the AI. */
function importedValues(metadata: Record<string, any>, origins?: Record<string, 'ai' | 'user'>): CachedValues {
  const values: Record<string, any> = {};
  const fromAi: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(withoutInternalKeys(metadata))) {
    if (value === undefined || value === null) continue;
    values[key] = value;
    fromAi[key] = origins ? origins[key] !== 'user' : true;
  }
  return { values, origins: fromAi };
}
