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
import { InstanceRegistry, RunInput, RunOutcome, SharedInstanceState } from './instance-registry';
import { getCountableFields, groupFields, isValueFilled, sameValue } from './canvas-fields';
import { assertUsable, describeFailure, generationWarning } from './canvas-feedback';
import { collectMetadata, exportMetadata } from './canvas-metadata';

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
  private fieldValueCache: Map<string, { values: Record<string, any>, origins: Record<string, boolean> }>;

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
      components: new Set(),
      primaryId: null,
      generation: 0,
      editsDuringRun: new Map(),
      runInput: null,
      takeovers: new Map(),
      pendingTakeover: null,
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
    const hasExistingData = Object.keys(existingMetadata).length > 0;
    if (hasExistingData) {
      const fieldKeys = Object.keys(existingMetadata).filter(k => !k.startsWith('_'));
      this.logger.debug('Re-extraction with existing metadata:', fieldKeys.length, 'field keys');
    }
    return this.runExtraction(input, {
      startState: input.mode === 'text' ? { userText: input.value } : {},
      existingMetadata: hasExistingData ? existingMetadata : undefined,
      beforeRequest: hasExistingData ? undefined : run => this.initializeCoreFields(run),
    });
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
        return { input_source: 'node_id', text: '', node_id: input.value, repository: 'staging', normalize: true };
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
        version: 'latest',
        language: this.i18n.currentLang,
        include_core: true,
        enable_geocoding: true,
        existing_metadata: plan.existingMetadata,
        schema_file: plan.schemaFile ?? (this.getCurrentState().selectedContentType || undefined)
      });

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
      this.logger.error('Extraction failed:', error);
      if (run === scope.generation) {
        this.updateScope(scope, { extractionError: describeFailure(error, this.i18n) });
      }
      return { run, response: null };
    } finally {
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
      if (isNewSchema) {
        // Prepare fields WITHOUT triggering updateState — will be batched below
        preparedSpecialFields = await this.prepareSpecialFields(response.metadataset, run);
        if (run !== this.generation) return;
      }
      
      // Get label and icon for detected content type
      const concept = this.schema.getContentTypeConcepts().find(c => c.schema_file === response.metadataset);
      
      contentTypeUpdate = {
        detectedContentType: response.metadataset,
        selectedContentType: response.metadataset,
        contentTypeLabel: concept?.label || response.metadataset.replace('.json', ''),
        contentTypeIcon: concept?.icon || 'category'
      };
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
      if (edited) return this.applyEdit(field, edited);
      const value = metadata[field.fieldId];
      if (value !== undefined && value !== null) {
        const isAi = origins ? origins[field.fieldId] !== 'user' : true;
        return this.applyValueToField(field, value, isAi);
      }
      return field;
    };
    const updatedCoreFields = currentCoreFields.map(applyResult);
    const updatedSpecialFields = currentSpecialFields.map(applyResult);

    const allFields = [...updatedCoreFields, ...updatedSpecialFields];
    const visibleFields = getCountableFields(allFields);
    const filledFields = visibleFields.filter(f => f.status === FieldStatus.FILLED).length;

    // Strip internal meta-keys (e.g. _origins, _source_text) from metadata
    // to prevent duplication when exporting later
    const cleanMetadata: Record<string, any> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.startsWith('_')) {
        cleanMetadata[key] = value;
      }
    }
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

  private async initializeCoreFields(run: number): Promise<void> {
    const coreSchemaFields = await this.schema.getFields('core.json');
    if (!coreSchemaFields || run !== this.generation) return;

    const groups = await this.schema.getGroups('core.json');
    if (run !== this.generation) return;
    const language = this.schema.getActiveLanguage();
    const groupMap = new Map((groups || []).map((g: any) => [g.id, this.schema.localizeString(g.label, language)]));
    const groupOrderMap = new Map(groups?.map((g: any, index: number) => [g.id, index]) || []);
    const groupIconMap = new Map((groups || []).map((g: any) => [g.id, g.icon || '']));
    
    const coreFields: CanvasFieldState[] = coreSchemaFields
      .filter((field: any) => field.system?.ask_user !== false)
      .map((field: any) => this.createFieldState(field, 'Core', groupMap, groupOrderMap, groupIconMap, language));

    const fieldGroups = groupFields(coreFields, this.getCurrentState().fieldGroups);
    const visibleFields = getCountableFields(coreFields);

    this.updateState({
      coreFields: coreFields,
      fieldGroups: fieldGroups,
      totalFields: visibleFields.length,
      metadata: {}
    });
  }

  /**
   * Prepare special fields from a content-type schema WITHOUT triggering a state update.
   * Returns the prepared field array, or null if schema couldn't be loaded.
   */
  private async prepareSpecialFields(schemaFile: string, run: number): Promise<CanvasFieldState[] | null> {
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
    const language = this.schema.getActiveLanguage();
    const groupMap = new Map((groups || []).map((g: any) => [g.id, this.schema.localizeString(g.label, language)]));
    const groupOrderMap = new Map(groups?.map((g: any, index: number) => [g.id, index]) || []);
    const groupIconMap = new Map((groups || []).map((g: any) => [g.id, g.icon || '']));
    
    const schemaName = schemaFile.replace('.json', '')
      .split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    
    return specialSchemaFields
      .filter((field: any) => field.system?.ask_user !== false)
      .map((field: any) => this.createFieldState(field, schemaName, groupMap, groupOrderMap, groupIconMap, language));
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

  private createFieldState(
    field: any, 
    schemaName: string, 
    groupMap: Map<string, string>, 
    groupOrderMap: Map<string, number>,
    groupIconMap: Map<string, string>,
    language: string
  ): CanvasFieldState {
    const groupId = field.group || 'other';
    const groupLabel = this.schema.localizeString(field.group_label, language) 
      || groupMap.get(groupId) 
      || this.schema.getFallbackGroupLabel(language);
    const groupOrder = groupOrderMap.get(groupId) ?? 999;
    const groupIcon = groupIconMap.get(groupId) || '';
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
      const origin = new Map(field.subFields.map(sf => [sf.fieldId, sf.isAiGenerated]));
      const expanded = this.applyValueToField(relabelled, field.value, field.isAiGenerated ?? false);
      return {
        ...relabelled,
        subFields: expanded.subFields?.map(sf => ({ ...sf, isAiGenerated: origin.get(sf.fieldId) ?? sf.isAiGenerated }))
      };
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
          const updatedParent = { ...f, subFields: updatedSubs };
          // Reconstruct the parent object value from subfields
          updatedParent.value = this.shapeExpander.reconstructObjectFromSubFields(
            updatedParent, []
          );
          return updatedParent;
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

    this.updateState({
      coreFields: updatedCoreFields,
      specialFields: updatedSpecialFields,
      fieldGroups: groupFields(allFields, this.getCurrentState().fieldGroups),
      metadata,
      filledFields,
      totalFields: visibleFields.length
    });
  }

  // ===== Content Type Selection =====

  /** Switch to a content type; false if another action overtook it meanwhile. */
  async selectContentType(schemaFileOrUri: string): Promise<boolean> {
    // A choice still loading its schema has already ended the spinner of the
    // run it cut short; one made meanwhile takes that interruption over.
    const interrupted = this.getCurrentState().isExtracting ? this.generation : this.shared.pendingTakeover;
    const choice = this.chooseContentType(schemaFileOrUri, interrupted !== null);
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
    interruptedExtraction: boolean
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
        
    // Restore cached values for the new content type (if any)
    this.restoreCachedFieldValues(schemaFile);
    
    const concept = this.schema.getContentTypeConcepts().find(c => c.schema_file === schemaFile);
    
    this.updateState({
      selectedContentType: schemaFile,
      detectedContentType: schemaFile,
      contentTypeLabel: concept?.label || schemaFile.replace('.json', ''),
      contentTypeIcon: concept?.icon || 'category'
    });
    
    // If there is a source and no cached data for this type, regenerate - also
    // when the choice cut an extraction short: its request stands, for this
    // type, whatever is cached (the cache does not hold that run's result).
    const hasExistingData = state.filledFields > 0;
    const cached = this.fieldValueCache.has(schemaFile);
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
    
    if (Object.keys(values).length > 0) {
      this.fieldValueCache.set(schemaFile, { values, origins });
      this.logger.info(`Cached ${Object.keys(values).length} field values for ${schemaFile}`);
    }
  }

  private restoreCachedFieldValues(schemaFile: string): void {
    const cached = this.fieldValueCache.get(schemaFile);
    if (!cached) return;
    
    const state = this.getCurrentState();
    
    const restoredSpecialFields = state.specialFields.map(field => {
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
    
    // Resolve URI to schema filename if needed
    if (schemaFile) {
      schemaFile = this.schema.resolveSchemaFileOrUri(schemaFile);
    }
    
    // Initialize core fields unless explicitly skipped
    if (!options?.skipCore) {
      try {
        await this.initializeCoreFields(run);
      } catch (err) {
        this.logger.warn('Core schema not available, continuing without core fields');
      }
      if (run !== this.generation) return false;
    }

    if (schemaFile && schemaFile !== 'core.json') {
      await this.loadSpecialSchema(schemaFile, run);
      if (run !== this.generation) return false;

      // Set content type label and icon so UI (floating buttons) reflects the loaded type
      const concept = this.schema.getContentTypeConcepts().find(c => c.schema_file === schemaFile);
      this.updateState({
        detectedContentType: schemaFile,
        selectedContentType: schemaFile,
        contentTypeLabel: concept?.label || schemaFile.replace('.json', ''),
        contentTypeIcon: concept?.icon || 'category'
      });
    } else {
      // No type of its own: the previous type's fields would be exported with it.
      this.updateState({
        specialFields: [],
        detectedContentType: null,
        selectedContentType: null,
        contentTypeLabel: undefined,
        contentTypeIcon: undefined
      });
    }

    const state = this.getCurrentState();
    
    const updatedCoreFields = state.coreFields.map(field => {
      const value = metadata[field.fieldId];
      if (value !== undefined && value !== null) {
        const isAi = origins ? origins[field.fieldId] !== 'user' : true;
        return this.applyValueToField(field, value, isAi);
      }
      return field;
    });

    const updatedSpecialFields = state.specialFields.map(field => {
      const value = metadata[field.fieldId];
      if (value !== undefined && value !== null) {
        const isAi = origins ? origins[field.fieldId] !== 'user' : true;
        return this.applyValueToField(field, value, isAi);
      }
      return field;
    });

    const allFields = [...updatedCoreFields, ...updatedSpecialFields];
    const visibleFields = getCountableFields(allFields);
    const filledFields = visibleFields.filter(f => f.status === FieldStatus.FILLED).length;

    // Strip internal meta-keys (_origins, _source_text) from metadata
    // to prevent duplication when exporting later
    const cleanMetadata: Record<string, any> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (!key.startsWith('_')) {
        cleanMetadata[key] = value;
      }
    }

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

  // ===== Export Metadata =====

  getMetadata(): Record<string, any> {
    return this.getCurrentState().metadata;
  }

  getMetadataForExport(): Record<string, any> {
    return exportMetadata(this.getCurrentState(), this.shapeExpander, this.schema, this.i18n.currentLang);
  }

  getMetadataForRepository(): Record<string, any> {
    return this.getMetadataForExport();
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
    this.shared.takeovers.clear(); // runs it replaces are no success of theirs
    this.shared.pendingTakeover = null;
  }

  // ===== Reset =====

  /** Takes over the scope: from now on only the returned number is current. */
  private nextGeneration(): number {
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

  reset(): void {
    this.nextGeneration(); // whatever is still running answers into the void
    this.shared.runInput = null;
    this.forgetPreviousForm();
    this.stateSubject.next(createInitialState());
    this.logger.info('Canvas state reset');
  }

  // ===== Content Type Change =====

  async changeContentTypeManually(schemaFileOrUri: string, label?: string, icon?: string): Promise<void> {
    if (!(await this.selectContentType(schemaFileOrUri))) return;
    if (label) {
      this.updateState({ contentTypeLabel: label });
    }
    if (icon) {
      this.updateState({ contentTypeIcon: icon });
    }
  }

  // ===== JSON Import =====

  async importJsonData(data: Record<string, any>): Promise<void> {
    this.logger.info('Importing JSON data');
    const metadata = data['metadata'] || data;
    const schemaFile = data['metadataset'] || data['metadataset_uri'] || data['schemaFile'];
    // Read _origins from top level (new format) or from inside metadata (old format)
    const origins: Record<string, 'ai' | 'user'> | undefined =
      data['_origins'] || metadata['_origins'];
    if (!(await this.loadMetadata(metadata, schemaFile, origins))) return;

    // Source text and preview image of the import (top level or inside metadata
    // for backward compat). Without them, none: the previous page's text would
    // be uploaded as extended_text and re-run for another type, its image
    // exported as preview_image_url.
    const sourceText = data['_source_text'] || metadata['_source_text'];
    const previewImageUrl = data['preview_image_url'] || metadata['preview_image_url'];
    this.updateState({ userText: sourceText || '', previewImageUrl: previewImageUrl || undefined });
    if (previewImageUrl) {
      this.logger.info('📸 Preview image loaded from imported JSON');
    }
  }

  // ===== Helper Methods =====

  /**
   * Apply a value to a field, expanding complex objects into subfields when shape is defined
   */
  private applyValueToField(field: CanvasFieldState, value: any, isAiGenerated = true): CanvasFieldState {
    const schemaFieldDef = this.schema.getFieldById(field.fieldId);
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
        status: FieldStatus.FILLED,
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
