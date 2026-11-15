import { 
  Component, 
  OnInit, 
  OnDestroy, 
  OnChanges, 
  SimpleChanges, 
  Input, 
  Output, 
  EventEmitter, 
  ChangeDetectionStrategy, 
  ChangeDetectorRef,
  NgZone,
  HostListener,
  HostBinding,
  ViewChild,
  ViewContainerRef,
  ComponentRef,
  ElementRef,
} from '@angular/core';
import { Subject, skip, takeUntil } from 'rxjs';

import { WIDGET_VERSION } from '../../version';
import { CanvasService } from '../../core/canvas.service';
import { SchemaService } from '../../core/schema.service';
import { ApiService } from '../../core/api.service';
import { LayoutService } from '../../core/layout.service';
import { I18nService } from '../../core/i18n.service';
import { DynamicTranslateLoader } from '../../core/dynamic-translate-loader';
import { InstanceRegistry } from '../../core/instance-registry';
import { failureCause, translated, uploadFailure } from '../../core/canvas-feedback';
import { InvalidRecordError } from '../../core/canvas-metadata';
import { isValueFilled } from '../../core/canvas-fields';
import { WidgetDebug } from '../../core/debug';
import { commitPendingInputs } from '../../core/pending-inputs';
import { CanvasState, ContentType } from '../../shared/models/canvas.models';
import { LayoutConfig, DEFAULT_LAYOUT } from '../../shared/layouts';
import { LAYOUT_COMPONENTS, LayoutInputs, LayoutName, LayoutOutputs, createLayout } from './layout-host';
import { Notice, WidgetNoticeComponent } from '../shared/widget-notice/widget-notice.component';

/**
 * `metadata-input` as the record it stands for. The attribute form arrives as
 * JSON text and is parsed once; imported as text, every character became a
 * "field" (W-SEC-01). null for anything that is not one object.
 */
function asRecord(input: unknown): Record<string, unknown> | null {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * A boolean input as the host sets it: as a property (true/false) or as an
 * attribute ('true'/'false'). undefined and null mean "not set" - null is what
 * a removed attribute sends, and it used to count as false, so
 * `removeAttribute('readonly')` unlocked a read-only layout instead of handing
 * the decision back to it (audit 14.11., U-08 d). `unlessFalse`: an input
 * that is on for anything but false.
 */
function asFlag(value: unknown, unlessFalse = false): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return unlessFalse ? value !== false && value !== 'false' : value === true || value === 'true';
}

/**
 * The record as the elements of an instance compare it: without the export
 * time, and with the preview image by its size and ends. A screenshot is a
 * base64 text of megabytes; it was serialised in full at every state change
 * (audit 14.11., W-49).
 */
function comparableRecord(record: Record<string, unknown>): string {
  const image = record['preview_image_url'];
  const imageMark = typeof image === 'string' && image.length > 512
    ? `${image.length}:${image.slice(0, 128)}:${image.slice(-128)}`
    : image;
  return JSON.stringify({ ...record, exportedAt: null, preview_image_url: imageMark });
}

/**
 * Canvas Component - Orchestrator
 *
 * This component manages state and delegates rendering to layout components.
 * It does NOT render UI directly - that's the job of the layout components.
 * 
 * Usage:
 *   <app-canvas layout="default"></app-canvas>
 *   <app-canvas [readonly]="true"></app-canvas>
 */
@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [WidgetNoticeComponent],
  templateUrl: './canvas.component.html',
  styleUrls: ['./canvas.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CanvasService]
})
export class CanvasComponent implements OnInit, OnDestroy, OnChanges {
  /**
   * Widget version. The element does not expose it (only inputs become element
   * properties); hosts read customElements.get('metadata-agent-canvas').widgetVersion.
   */
  readonly version = WIDGET_VERSION;

  /** Unique component ID for event deduplication across same-instance components */
  private static _nextId = 0;
  private _componentId = `canvas-${CanvasComponent._nextId++}`;
  private _instanceId = 'default';

  /**
   * Whether this element emits the DOM events of its instance. Asked each time,
   * not cached: when the primary element goes away the registry promotes the
   * next one, and a cached flag kept that element silent for good (U-07).
   */
  private get _isPrimary(): boolean {
    return InstanceRegistry.isPrimary(this._instanceId, this._componentId);
  }

  /** The widget root says which language it speaks (WCAG 3.1.1/3.1.2, U-16). */
  @HostBinding('attr.lang') get hostLang(): string {
    return this.i18n.currentLang;
  }

  @HostBinding('class.borderless') get isBorderless(): boolean {
    return this._borderless === true || (this._borderless === undefined && this._layout.style.borderless);
  }

  @HostBinding('class.ready') get isReady(): boolean {
    return this._initialized;
  }

  // ===== INPUT PROPERTIES =====

  /**
   * Instance ID for multi-instance support.
   * - Different IDs → fully isolated state & events.
   * - Same ID       → shared state, events fire only once (from the primary component).
   * - Default: 'default' (backward-compatible — all untagged components share state).
   */
  @Input() set instanceId(value: string) {
    if (WidgetDebug.enabled) console.log(`[${this._componentId}] instanceId setter called: "${value}" (current: "${this._instanceId}")`);
    if (value && value !== this._instanceId) {
      // Unregister from old instance
      InstanceRegistry.unregister(this._instanceId, this._componentId);
      this._instanceId = value;
      this.canvas.bindToInstance(value);
      InstanceRegistry.register(value, this._componentId);
      this.applyHostSettings();
      if (WidgetDebug.enabled) console.log(`[${this._componentId}] → bound to instance "${value}", isPrimary=${this._isPrimary}`);
    }
  }
  
  /**
   * Enable debug logging to the browser console.
   * HTML: debug="true"  /  JS: element.debug = true
   * Default: false (no debug output).
   */
  @Input() set debug(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    WidgetDebug.enabled = value === true || value === 'true';
  }

  @Input() set apiUrl(value: string) {
    if (WidgetDebug.enabled) console.log(`[${this._componentId}] apiUrl setter called: "${value}"`);
    if (value) {
      this._apiUrl = value;
      this.apiService.setApiUrl(value);
      // Set API URL for i18n loader and force reload so cached empty translations are replaced
      DynamicTranslateLoader.setApiUrl(value);
      this.i18n.reloadTranslations();
      // The first load may have failed for want of this address (K-22).
      if (this._initialized) void this.initSchema();
    }
  }
  
  /**
   * The widget's language, set by the host page: `de` or `en` (audit 14.11.,
   * U-05). It wins over the choice the language switch remembered - the host
   * could not set the language at all, and the embedding recommended for
   * edu-sharing hides the only switch. Not set (or removed, or a language the
   * widget does not speak): the remembered choice, then the `lang` of the
   * page around the element, then the browser's language.
   * One language for all widgets of a page.
   */
  @Input() set language(value: string | undefined | null) {
    this.i18n.setHostLanguage(value);
  }

  @Input() set contextName(value: string) {
    if (value) this._contextName = value;
  }
  
  @Input() set schemaVersion(value: string) {
    if (value) this._schemaVersion = value;
  }
  
  @Input() set viewerMode(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    // Backward compat: viewerMode now maps to readonly
    this._readonly = value === true || value === 'true';
  }
  
  /**
   * Read-only view. The bare attribute (`<metadata-agent-canvas readonly>`)
   * means true, as HTML has it; it arrived as '' and switched read-only off,
   * also against a read-only layout (audit 14.11., W-46). Not set (removed
   * attribute): the layout decides.
   */
  @Input() set readonly(value: boolean | string | undefined | null) {
    this._readonly = value === '' ? true : asFlag(value);
  }

  @Input() set borderless(value: boolean | string | undefined | null) {
    this._borderless = asFlag(value);
  }

  @Input() set flatGroups(value: boolean | string | undefined | null) {
    this._flatGroups = asFlag(value) ?? false;
  }

  @Input() backgroundColor = '';

  @Input() set columns(value: number | string | undefined | null) {
    if (value === undefined || value === null) {
      this._columnsOverride = undefined; // not set: the layout's columns
      return;
    }
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (num >= 1 && num <= 4) this._columnsOverride = num as 1 | 2 | 3 | 4;
  }
  
  @Input() set layout(value: string) {
    this._layout = this.layoutService.getLayout(value);
    this._layoutName = this._layout.name; // Use canonical name after alias resolution
    if (this._initialized) {
      this.renderLayout();
    }
  }
  
  // Individual element visibility (override layout defaults)
  @Input() set showInputArea(value: boolean | string | undefined) {
    this._showInputArea = asFlag(value);
  }
  
  @Input() set showStatusBar(value: boolean | string | undefined) {
    this._showStatusBar = asFlag(value);
  }
  
  @Input() set showCoreFields(value: boolean | string | undefined) {
    this._showCoreFields = asFlag(value, true);
  }
  
  @Input() set showSpecialFields(value: boolean | string | undefined) {
    this._showSpecialFields = asFlag(value, true);
  }
  
  /** Without effect: no layout has a footer. Kept so that `el.showFooter` stays an input (README). */
  @Input() showFooter: boolean | string | undefined;
  
  @Input() set showFloatingControls(value: boolean | string | undefined) {
    this._showFloatingControls = asFlag(value);
  }
  
  // Alias for showFloatingControls (OEH compatibility)
  @Input() set controls(value: boolean | string | undefined) {
    this._showFloatingControls = asFlag(value);
  }
  
  @Input() set showFieldActions(value: boolean | string | undefined) {
    this._showFieldActions = asFlag(value, true);
  }
  
  @Input() set showUploadButton(value: boolean | string | undefined) {
    this._showUploadButton = asFlag(value);
  }
  
  @Input() set showSaveButton(value: boolean | string | undefined) {
    this._showSaveButton = asFlag(value);
  }
  
  @Input() set showJsonLoader(value: boolean | string | undefined) {
    this._showJsonLoader = asFlag(value);
  }
  
  @Input() set showLanguageSwitcher(value: boolean | string | undefined) {
    this._showLanguageSwitcher = asFlag(value);
  }
  
  @Input() set showContentType(value: boolean | string | undefined) {
    this._showContentType = asFlag(value);
  }
  
  @Input() set showResetButton(value: boolean | string | undefined) {
    this._showResetButton = asFlag(value);
  }
  
  // The four below have no layout value behind them: not set is their default.
  @Input() set showPreview(value: boolean | string | undefined) {
    this._showPreview = asFlag(value, true) ?? true;
  }

  @Input() set showPageMode(value: boolean | string | undefined) {
    this._showPageMode = asFlag(value) ?? false;
  }

  // OEH compatibility: Show only content type selector in floating controls
  @Input() set showContentTypeOnly(value: boolean | string | undefined) {
    this._showContentTypeOnly = asFlag(value) ?? false;
  }

  // Highlight AI-generated fields with purple text (off unless set)
  @Input() set highlightAi(value: boolean | string | undefined) {
    this._highlightAi = asFlag(value, true) ?? false;
  }

  /**
   * The record to show. null is "nothing handed in" - the value before the
   * host sets one and what a removed attribute sends - and leaves the form as
   * it is; `forceReset` empties it (audit 14.11., W-48). The same object again
   * is no new record either: Angular hands an input over when its value
   * changed, so a host that changed the record assigns a new object.
   *
   * Applied when it is set, like `contentType`, and not with the next change
   * detection (ngOnChanges): set in one task, the type came first whatever
   * the host had set first, while a tick apart the order of setting decided.
   * Only the record handed in with the element's first inputs waits for all
   * of them - `api-url` and `instance-id` may come after it.
   */
  @Input() set metadataInput(value: Record<string, unknown> | string | null) {
    this._metadataInput = value;
    if (this._initialized) {
      if (value) void this.loadMetadata(value);
    } else {
      this.initialRecordPending = !!value;
    }
  }
  get metadataInput(): Record<string, unknown> | string | null {
    return this._metadataInput;
  }
  private _metadataInput: Record<string, unknown> | string | null = null;
  private initialRecordPending = false;

  /** Imports the record of the first inputs, once they are all applied. */
  private loadInitialRecord(): void {
    if (!this.initialRecordPending) return;
    this.initialRecordPending = false;
    void this.loadMetadata(this._metadataInput);
  }
  
  @Input() set previewImage(value: string | undefined) {
    if (value !== undefined && value !== null) {
      this._hostPreviewImage = value;
      // Through the service: a patch of the local `state` copy was replaced by
      // the next state emission, so the image never showed.
      this.canvas.setPreviewImage(value);
    }
  }
  /** The host's last `preview-image`; a metadata-input import without an image of its own keeps it. */
  private _hostPreviewImage?: string;

  /**
   * What the host set on this element and only the state holds - screenshot
   * settings, preview image - goes into the state again once that was replaced:
   * by a reset or by another instance-id (W-LOG-08). Only what the host did
   * set: an element joining an instance must not overwrite the settings there
   * with its defaults.
   */
  private applyHostSettings(): void {
    if (this._screenshotEnabled !== undefined) this.canvas.setScreenshotEnabled(this._screenshotEnabled);
    if (this._screenshotMethod) this.canvas.setScreenshotMethod(this._screenshotMethod);
    if (this._hostPreviewImage !== undefined) this.canvas.setPreviewImage(this._hostPreviewImage);
  }

  /** Empties the form; the host's settings stay. */
  private resetForm(): void {
    this.canvas.reset();
    this.applyHostSettings();
    // An upload that is still out no longer holds the button (W-50); its
    // answer is still shown when it comes.
    this.uploadAttempt++;
    this.uploading = false;
  }
  
  // Screenshot: enable/disable and method configuration
  @Input() set enableScreenshot(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    const enabled = value !== false && value !== 'false';
    this._screenshotEnabled = enabled;
    this.canvas.setScreenshotEnabled(enabled);
  }

  @Input() set screenshotMethod(value: 'pageshot' | 'playwright' | string) {
    if (value === 'pageshot' || value === 'playwright') {
      this._screenshotMethod = value;
      this.canvas.setScreenshotMethod(value);
    }
  }

  // Content type: set schema file name or URI from outside (e.g. 'event.json' or 'http://w3id.org/openeduhub/vocabs/contentTypes/event')
  @Input() set contentType(value: string) {
    if (value) {
      this._hostContentType = value;
      this._pendingContentType = value;
      // Only apply immediately if content types are already loaded (i.e. after ngOnInit).
      // Otherwise ngOnInit will re-apply the pending content type after core schema is loaded.
      if (this.contentTypes.length > 0) {
        void this.hostTask(() => this.applyContentType(value));
      }
    }
  }
  /**
   * The type the host set last, until the editor picks one; an import without
   * a metadataset of its own takes it (F2).
   */
  private _hostContentType: string | null = null;
  
  // Input mode: 'text' | 'url' | 'nodeId'
  @Input() set inputMode(value: 'text' | 'url' | 'nodeId') {
    this._inputMode = value;
  }
  get inputModeValue(): 'text' | 'url' | 'nodeId' {
    return this._inputMode;
  }
  
  // Browser plugin integration: settable text/URL + auto-extract trigger
  @Input() set text(value: string) {
    if (value !== undefined && value !== null) {
      this.ngZone.run(() => {
        this.userText = value;
        this.markForCheck();
      });
    }
  }
  
  @Input() set url(value: string) {
    if (value !== undefined && value !== null) {
      this.ngZone.run(() => {
        this.sourceUrl = value;
        this.markForCheck();
      });
    }
  }
  
  @Input() set autoExtract(value: boolean | string | number) {
    // Accept boolean, string 'true', or any truthy value (e.g. timestamp/counter)
    // to ensure repeated calls always trigger even if previous value was also truthy
    if (value && String(value) !== 'false' && String(value) !== '0') {
      this._autoExtractPending = true;
      // Use ngZone.run to ensure Angular detects changes from external JS (browser plugin)
      this.ngZone.run(() => {
        this.autoExtractTimer = setTimeout(() => this.triggerAutoExtract(), 0);
      });
    }
  }

  // Programmatic reset without confirmation dialog (for browser plugin)
  @Input() set forceReset(value: boolean | string | number) {
    if (value && String(value) !== 'false' && String(value) !== '0') {
      this.ngZone.run(() => {
        this.resetForm();
        this.userText = '';
        this.sourceUrl = '';
        this.nodeId = '';
        this.markForCheck();
      });
    }
  }
  
  // ===== OUTPUT EVENTS =====
  
  @Output() metadataChange = new EventEmitter<Record<string, unknown>>();
  @Output() metadataSubmit = new EventEmitter<Record<string, unknown>>();
  @Output() uploadResult = new EventEmitter<{ success: boolean; nodeId?: string; error?: string; duplicate?: boolean; repositoryUrl?: string }>();
  @Output() reloadFromPage = new EventEmitter<void>();
  
  // ===== INTERNAL STATE =====
  
  state: CanvasState | null = null;
  userText = '';
  /** What the widget tells or asks the editor (WidgetNoticeComponent). */
  notice: Notice | null = null;
  private pendingAnswer?: (confirmed: boolean) => void;
  sourceUrl = '';
  nodeId = '';
  _inputMode: 'text' | 'url' | 'nodeId' = 'text';
  _autoExtractPending = false;
  _pendingContentType: string | null = null;
  contentTypes: ContentType[] = [];
  
  // Configuration
  _apiUrl = '';
  _contextName = 'default';
  _schemaVersion = 'latest';
  _readonly: boolean | undefined = undefined;
  _borderless: boolean | undefined = undefined;
  _flatGroups = false;
  _layoutName = 'default';
  _layout: LayoutConfig = DEFAULT_LAYOUT;
  
  // Element visibility overrides (undefined = use layout default)
  _showInputArea: boolean | undefined = undefined;
  _showStatusBar: boolean | undefined = undefined;
  _showCoreFields: boolean | undefined = undefined;
  _showSpecialFields: boolean | undefined = undefined;
  _showFloatingControls: boolean | undefined = undefined;
  _showFieldActions: boolean | undefined = undefined;
  _showUploadButton: boolean | undefined = undefined;
  _showSaveButton: boolean | undefined = undefined;
  _showJsonLoader: boolean | undefined = undefined;
  _showLanguageSwitcher: boolean | undefined = undefined;
  _showContentType: boolean | undefined = undefined;
  _showResetButton: boolean | undefined = undefined;
  _showPageMode = false;
  _showContentTypeOnly = false;  // OEH: Show only content type in floating controls
  _highlightAi = false;  // Highlight AI-generated fields with purple text (disabled by default)
  _showPreview = true;  // Show preview thumbnail (default: true)
  _columnsOverride: 1 | 2 | 3 | 4 | undefined = undefined;
  /** As the host set them; undefined until it does (applyHostSettings). */
  _screenshotEnabled: boolean | undefined = undefined;
  _screenshotMethod: 'pageshot' | 'playwright' | undefined = undefined;

  /** Prevents rendering until all initial @Input setters have fired (anti-flicker) */
  _initialized = false;
  
  private _metadataChangeTimer: any = null;
  private destroy$ = new Subject<void>();
  
  constructor(
    public canvas: CanvasService,
    private schema: SchemaService,
    private apiService: ApiService,
    private layoutService: LayoutService,
    public i18n: I18nService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private elementRef?: ElementRef<HTMLElement>
  ) {
    // Bind to default instance and register for event dedup
    this.canvas.bindToInstance(this._instanceId);
    InstanceRegistry.register(this._instanceId, this._componentId);
  }
  
  // ===== PLUGIN EVENT BRIDGE =====
  // CustomEvent-based extraction trigger — much more reliable than @Input setters
  // for external JS (browser plugin) because events always fire inside Angular's zone
  // via @HostListener, and there are no change detection timing issues.
  //
  // Usage from plugin:
  //   element.dispatchEvent(new CustomEvent('plugin-extract', {
  //     detail: { text: '...', url: '...', inputMode: 'text', reset: true }
  //   }));
  @HostListener('plugin-extract', ['$event'])
  onPluginExtract(event: Event): void {
    // Angular types host-listener events as Event; the plugin sends a CustomEvent.
    const { text, url, inputMode, reset } = (event as CustomEvent).detail || {};
    if (WidgetDebug.enabled) console.log('📩 plugin-extract event received:', { textLength: text?.length, url, inputMode, reset });

    // Reset state if requested (new URL)
    if (reset) {
      this.resetForm();
    }

    // Set input mode
    if (inputMode) {
      this._inputMode = inputMode;
    }

    // Set data
    if (text) {
      this.userText = text;
    }
    if (url) {
      this.sourceUrl = url;
    }

    this.markForCheck();

    // Trigger extraction immediately
    this._autoExtractPending = true;
    this.autoExtractTimer = setTimeout(() => this.triggerAutoExtract(), 0);
  }

  // ===== LIFECYCLE =====
  
  async ngOnInit(): Promise<void> {
    // The page's own language, for a host that sets none: the nearest `lang`
    // above the element (its own attribute is the widget's answer, see hostLang).
    if (this.elementRef) {
      this.i18n.setPageLanguage(this.elementRef.nativeElement.parentElement?.closest('[lang]')?.getAttribute('lang'));
    }

    // All @Input setters have fired by now → safe to render
    this._initialized = true;
    this.renderLayout();
    this.loadInitialRecord();

    // Subscribe to state changes (always, even if schema load fails)
    this.canvas.state$.pipe(takeUntil(this.destroy$)).subscribe((state: CanvasState) => {
      this.announceProgress(this.state, state);
      this.state = state;
      // Debounce metadataChange emissions (50ms) to avoid flooding the host page.
      // Skip emission entirely while extracting — the expensive getMetadataForExport()
      // + ngZone.run() would cause full CD cycles that block scrolling.
      // The final emission fires automatically when isExtracting turns false.
      if (!state.isExtracting) {
        // An edit of the editor is reported in the same task (audit 14.11.,
        // W-36): the value is taken when the field is left, and a host that
        // saves on its own button read the record 50 ms too early.
        if (this.canvas.isEdit) this.flushMetadataChange(true);
        else this.scheduleMetadataChange();
      }
      this.markForCheck();
    });
    
    // Subscribe to language changes: content-type list and the form's labels (U-04).
    // Changes only: the stream replays the current language at once, which
    // relabelled an empty form and loaded the core schema before setContext.
    this.i18n.language$.pipe(skip(1), takeUntil(this.destroy$)).subscribe(() => {
      this.refreshContentTypes();
      void this.canvas.relocalizeFields();
    });

    await this.initSchema();
  }

  /**
   * Context, core schema and content types - what the type menu and
   * `contentType` need. A failure is not final (K-22): a later `apiUrl`, an
   * import or an extraction asks again, and the error it left goes once it
   * worked. One attempt at a time.
   */
  private initSchema(): Promise<void> {
    if (this.schemaReady) return Promise.resolve();
    this.schemaInit ??= this.loadSchema().finally(() => (this.schemaInit = null));
    return this.schemaInit;
  }
  private schemaReady = false;
  private schemaInit: Promise<void> | null = null;
  /** The message of the failed initialisation, while it may still be shown. */
  private initError: string | null = null;

  private async loadSchema(): Promise<void> {
    try {
      // Initialize schema context with optional version
      await this.schema.setContext(this._contextName, this._schemaVersion);
      await this.schema.loadCoreSchema();

      // Load content types
      this.contentTypes = await this.schema.getContentTypes();
      this.schemaReady = true;
      if (this.initError !== null && this.canvas.getCurrentState().extractionError === this.initError) {
        this.canvas.clearError();
      }
      this.initError = null;

      // Re-apply pending content type now that core schema is loaded (URI resolution requires it)
      if (this._pendingContentType) {
        const pending = this._pendingContentType;
        this._pendingContentType = null;
        // After an import the host made meanwhile (review-demo.html: the
        // attribute plus metadataInput after whenDefined), and only if the
        // import did not bring this type already: switching would cut the
        // import short or replace its form (F1).
        await this.hostTask(async () => {
          if (this.schema.resolveSchemaFileOrUri(pending) === this.canvas.getCurrentState().selectedContentType) return;
          await this.applyContentType(pending);
        });
      }
    } catch (error: any) {
      console.error('Failed to initialize schema:', error);
      const cause = failureCause(error, this.i18n);
      this.initError = translated(this.i18n, 'ALERTS.SCHEMA_INIT_FAILED', { error: cause },
        `Schema initialization failed: ${cause}`);
      this.canvas.setError(this.initError);
    }

    this.markForCheck();
  }
  
  ngOnChanges(_changes: SimpleChanges): void {
    this.markForCheck(); // an input of the element may be bound to the layout
    this.loadInitialRecord(); // the first ngOnChanges follows the first inputs
  }
  
  ngOnDestroy(): void {
    // An unanswered question counts as cancelled; its caller must not wait forever.
    this.settleQuestion(false);
    // A pending metadataChange would fire on an element that is gone.
    clearTimeout(this._metadataChangeTimer);
    clearTimeout(this.announceTimer);
    // Nor an extraction the host asked for a moment ago (auto-extract,
    // plugin-extract): it would run for an element nobody sees (W-N).
    clearTimeout(this.autoExtractTimer);
    this._autoExtractPending = false;
    InstanceRegistry.unregister(this._instanceId, this._componentId);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== ACTIONS =====

  private autoExtractTimer: ReturnType<typeof setTimeout> | undefined;

  private triggerAutoExtract(): void {
    if (!this._autoExtractPending) return;
    this._autoExtractPending = false;
    
    if (WidgetDebug.enabled) console.log('🤖 Auto-extract triggered:', { mode: this._inputMode, hasText: !!this.userText, hasUrl: !!this.sourceUrl });
    
    if (this._inputMode === 'url' && this.sourceUrl.trim()) {
      this.startUrlExtraction(this.sourceUrl);
    } else if (this._inputMode === 'nodeId' && this.nodeId.trim()) {
      this.startNodeIdExtraction(this.nodeId);
    } else if (this.userText.trim()) {
      this.startExtraction();
    } else if (this.sourceUrl.trim()) {
      // Fallback: if text mode but no text, try URL
      this.startUrlExtraction(this.sourceUrl);
    }
  }
  
  startExtraction(): void {
    if (!this.userText.trim()) {
      this.say('ALERTS.INPUT_REQUIRED');
      return;
    }
    const text = this.userText;
    void this.initSchema(); // again, if the first load failed (K-22)
    // Run outside Angular zone so zone.js doesn't track it as a long task
    this.ngZone.runOutsideAngular(() => setTimeout(async () => {
      const succeeded = await this.canvas.startExtraction(text);
      this.ngZone.run(() => {
        // Emptied only now: cleared up front, a failed request lost the text
        // (U-10). The box is read-only while the run is out, so it still holds
        // `text` unless a reset emptied it meanwhile.
        if (succeeded && this.userText === text) {
          this.userText = '';
        }
        this.markForCheck();
      });
    }));
  }
  
  startUrlExtraction(url: string): void {
    if (!url.trim()) {
      this.say('ALERTS.INPUT_REQUIRED');
      return;
    }
    void this.initSchema();
    this.ngZone.runOutsideAngular(() => setTimeout(async () => {
      await this.canvas.startUrlExtraction(url);
      this.ngZone.run(() => this.markForCheck());
    }));
  }
  
  startNodeIdExtraction(nodeId: string): void {
    if (!nodeId.trim()) {
      this.say('ALERTS.INPUT_REQUIRED');
      return;
    }
    void this.initSchema();
    this.ngZone.runOutsideAngular(() => setTimeout(async () => {
      await this.canvas.startNodeIdExtraction(nodeId);
      this.ngZone.run(() => this.markForCheck());
    }));
  }
  
  async selectContentType(contentType: ContentType): Promise<void> {
    // Not from a read-only view (W-LOG-09): the choice rebuilds the form and,
    // with a source text, starts an AI run. Checked here and not in the
    // service, which also applies the host's content-type - that one counts in
    // a read-only view as well (Prüftisch).
    if (this.effectiveReadonly) return;
    // The editor's choice replaces the host's: a later import without a
    // metadataset must not rebuild the form as the host's type.
    this._hostContentType = null;
    await this.canvas.changeContentTypeManually(contentType.schemaFile, contentType.label, contentType.icon);
    this.markForCheck();
  }
  
  /**
   * The host's type. Settles once the type and its fields are in the form: a
   * re-run it starts goes on, but the host queue does not wait for it - the
   * next metadata-input (the Prüftisch moves on) would wait up to a whole
   * /generate call and then be preceded by the previous node's result. That
   * import supersedes the re-run.
   */
  private applyContentType(schemaFileOrUri: string): Promise<void> {
    // Resolve URI to schema filename if needed (e.g. 'http://w3id.org/openeduhub/vocabs/contentTypes/event' → 'event.json')
    const schemaFile = this.schema.resolveSchemaFileOrUri(schemaFileOrUri);
    // Label and icon of a known type; otherwise the service names it (and
    // core.json, "general", gets none - W-L6).
    const ct = this.contentTypes.find(c => c.schemaFile === schemaFile);
    return new Promise<void>((applied, failed) => {
      this.canvas.changeContentTypeManually(schemaFile, ct?.label, ct?.icon, applied).then(() => {
        this.markForCheck();
        applied();
      }, failed);
    });
  }
  
  /**
   * "Save": the record goes to the host from the element whose button was
   * pressed. It came only from the primary element of an instance, so the
   * button in any other one did nothing (audit 14.11., W-35). metadataChange
   * stays with the primary element: it reports one shared form once.
   */
  submit(): void {
    commitPendingInputs();
    this.metadataSubmit.emit(this.canvas.getMetadataForExport());
  }

  /** True while an upload runs; the layouts disable their upload button (U-02). */
  uploading = false;
  /** Counts uploads and resets: a reset frees the button of an upload that hangs (W-50). */
  private uploadAttempt = 0;

  async uploadToRepository(): Promise<void> {
    // A second click while the request is out would create the node twice;
    // during an extraction it would send the form from before the result (L-10).
    if (this.uploading || this.canvas.getCurrentState().isExtracting) return;
    // Not a form that lacks the fields of a schema that failed to load: the
    // record would be written without them (audit 14.11., W-45).
    if (this.canvas.hasSchemaError()) {
      this.say('ALERTS.UPLOAD_FORM_INCOMPLETE', undefined, 'error',
        'Not uploaded: the fields of this form could not be loaded completely. Please choose the content type again or reload the page.');
      this.uploadResult.emit({ success: false, error: this.notice?.text });
      return;
    }
    const attempt = ++this.uploadAttempt;
    this.uploading = true;
    this.markForCheck();
    try {
      await this.runUpload();
    } finally {
      if (attempt === this.uploadAttempt) {
        this.uploading = false;
        this.markForCheck();
      }
    }
  }

  private async runUpload(): Promise<void> {
    commitPendingInputs();
    const metadata = this.canvas.getMetadataForRepository();
    const state = this.canvas.getCurrentState();
    const extendedText = state.userText || undefined;

    try {
      const result = await this.apiService.upload({
        metadata,
        check_duplicates: true,
        start_workflow: true,
        write_extended_data: true,
        extended_text: extendedText
      });
      
      this.uploadResult.emit({
        success: result.success,
        nodeId: result.node?.nodeId,
        error: result.error,
        duplicate: result.duplicate,
        repositoryUrl: result.node?.repositoryUrl
      });
      
      if (result.duplicate && !result.success) {
        const again = await this.ask('ALERTS.UPLOAD_DUPLICATE', {
          title: result.node?.title || '',
          url: result.node?.repositoryUrl || ''
        });
        if (again) {
          // The question does not block the form: send what it holds now.
          const retryResult = await this.apiService.upload({
            metadata: this.canvas.getMetadataForRepository(),
            check_duplicates: false,
            start_workflow: true,
            write_extended_data: true,
            extended_text: this.canvas.getCurrentState().userText || undefined
          });
          this.uploadResult.emit({
            success: retryResult.success,
            nodeId: retryResult.node?.nodeId,
            error: retryResult.error,
            repositoryUrl: retryResult.node?.repositoryUrl
          });
          // The second attempt answered silently before (U-11).
          this.reportUpload(retryResult);
        }
      } else {
        this.reportUpload(result);
      }
    } catch (error: any) {
      const msg = uploadFailure(error, this.i18n);
      this.say('ALERTS.UPLOAD_ERROR', { error: msg }, 'error');
      this.uploadResult.emit({ success: false, error: msg });
    }
  }

  private reportUpload(result: { success: boolean; error?: string; node?: { nodeId?: string; repositoryUrl?: string } }): void {
    if (result.success) {
      this.say('ALERTS.UPLOAD_SUCCESS', {
        nodeId: result.node?.nodeId || '',
        url: result.node?.repositoryUrl || ''
      });
    } else {
      this.say('ALERTS.UPLOAD_ERROR', { error: result.error || translated(this.i18n, 'ALERTS.UNKNOWN_ERROR', undefined, 'Unknown error') }, 'error');
    }
  }
  
  async reset(): Promise<void> {
    if (await this.ask('ALERTS.CONFIRM_RESET', undefined, true)) {
      this.resetForm();
      this.userText = '';
    }
  }
  
  // ===== JSON Import/Export =====
  
  downloadJson(): void {
    commitPendingInputs();
    const metadata = this.canvas.getMetadataForExport();
    const json = JSON.stringify(metadata, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metadata-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  /** A JSON file; what is no record is refused with the message for an unreadable file (W-34). */
  async onJsonLoaded(jsonData: unknown): Promise<void> {
    try {
      await this.importRecord(jsonData);
      this.markForCheck();
    } catch (error) {
      console.error('Error importing JSON:', error);
      this.say('ALERTS.JSON_LOAD_ERROR', undefined, 'error');
    }
  }

  /** The JSON loader could not read or parse the chosen file (U-11). */
  onJsonLoadError(): void {
    this.say('ALERTS.JSON_LOAD_ERROR', undefined, 'error');
  }
  
  // ===== NOTICES =====

  /**
   * Tell the editor something; replaces an open question, which counts as
   * cancelled. `fallback` is shown while the texts are not loaded.
   */
  private say(key: string, params?: Record<string, unknown>, kind: Notice['kind'] = 'info', fallback?: string): void {
    this.settleQuestion(false);
    this.notice = { text: fallback ? translated(this.i18n, key, params, fallback) : this.i18n.instant(key, params), kind };
    this.markForCheck();
  }

  /** Ask for confirmation; resolves with the answer (false for cancel/Escape). */
  private ask(key: string, params?: Record<string, unknown>, destructive = false): Promise<boolean> {
    this.settleQuestion(false);
    this.notice = { text: this.i18n.instant(key, params), kind: 'info', question: true, destructive };
    this.markForCheck();
    return new Promise(resolve => (this.pendingAnswer = resolve));
  }

  onNoticeClosed(confirmed: boolean): void {
    this.notice = null;
    this.settleQuestion(confirmed);
    this.markForCheck();
  }

  private settleQuestion(confirmed: boolean): void {
    const answer = this.pendingAnswer;
    this.pendingAnswer = undefined;
    answer?.(confirmed);
  }

  // ===== ANNOUNCEMENTS =====

  /** Text of the live region (canvas template). */
  announcement = '';
  private announceTimer: ReturnType<typeof setTimeout> | undefined;

  /** Start and end of an extraction, with its warning (U-1). */
  private announceProgress(before: CanvasState | null, after: CanvasState): void {
    const started = !before?.isExtracting && after.isExtracting;
    const finished = !!before?.isExtracting && !after.isExtracting;
    if (started) {
      this.announce(this.i18n.instant('ANNOUNCE.EXTRACTION_STARTED'));
    } else if (finished && !after.extractionError) {
      // An error is announced by its own role=alert message in the layout.
      const done = this.i18n.instant('ANNOUNCE.EXTRACTION_DONE', { count: after.filledFields ?? 0 });
      this.announce(after.extractionWarning ? `${done} ${after.extractionWarning}` : done);
    }
  }

  /** Emptied first and filled a tick later: the same text again is announced again. */
  private announce(text: string): void {
    this.announcement = '';
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => {
      this.announcement = text;
      this.markForCheck();
    });
  }

  // ===== HELPERS =====

  private scheduleMetadataChange(): void {
    clearTimeout(this._metadataChangeTimer);
    this._metadataChangeTimer = setTimeout(() => this.flushMetadataChange(), 50);
  }

  /**
   * Reports now what waits for the debounce; with `always`, also when nothing
   * waits (an edit). Before an import, too: the import's steps are not
   * reported, and a report still waiting when it started was dropped with
   * them - the result of the extraction that had just ended, for instance (W-36).
   */
  private flushMetadataChange(always = false): void {
    const waiting = this._metadataChangeTimer !== null;
    clearTimeout(this._metadataChangeTimer);
    this._metadataChangeTimer = null;
    if (waiting || always) this.reportMetadata();
  }

  /**
   * Emits metadataChange when there is something new to tell the host
   * (W-LOG-06) - it writes every event's record into its own form:
   * - not for a state change that leaves the record as it is (a dismissed
   *   message, the screenshot switch); the export time does not count;
   * - not before the form holds anything: the empty record at the start
   *   replaced the host's stored one;
   * - not for the steps of an import or an extraction, but once for each
   *   finished import, also when its record is the one reported last.
   *
   * What was reported last and which imports run is kept with the instance,
   * not here (audit 14.11., W-35, W-48): the primary element reports for all
   * elements of the instance - also an import another one started, and, once
   * promoted, a change against what its predecessor reported.
   */
  private reportMetadata(): void {
    if (!this._isPrimary || this.state?.isExtracting || this.canvas.importRunning) return;
    const record = this.canvas.getMetadataForExport();
    const comparable = comparableRecord(record);
    const reported = this.canvas.reportedRecord;
    const started = reported !== undefined
      || Object.values(record['metadata'] ?? {}).some(isValueFilled);
    const imported = this.canvas.takeFinishedImport();
    if (!imported && (comparable === reported || !started)) return;
    this.canvas.reportedRecord = comparable;
    this.ngZone.run(() => this.metadataChange.emit(record));
  }

  /** An import by this element; the service counts it for the instance. */
  private async importRecord(data: unknown, hostContentType?: string | null): Promise<void> {
    this.flushMetadataChange();
    void this.initSchema(); // again, if the first load failed (K-22)
    await this.canvas.importJsonData(data, hostContentType);
  }

  /**
   * What the host hands in (metadata-input, content-type) is applied in the
   * order it was set, each after the previous one: a type choice started while
   * an import loads its schemas supersedes the import, and vice versa (F1/F2).
   * A type's task ends when the type is applied, not after its re-run.
   * Starts at once when nothing is pending.
   */
  private hostTask(task: () => Promise<void>): Promise<void> {
    const started = this.hostQueue ? this.hostQueue.then(task) : task();
    const done = started.catch(() => undefined); // each task reports its own failure
    this.hostQueue = done;
    void done.then(() => {
      if (this.hostQueue === done) this.hostQueue = null;
    });
    return started;
  }
  private hostQueue: Promise<void> | null = null;

  /** Metadata handed in by the host (`metadata-input`); a failure is shown, not swallowed. */
  private loadMetadata(metadata: unknown): Promise<void> {
    return this.hostTask(() => this.importFromHost(metadata));
  }

  private async importFromHost(input: unknown): Promise<void> {
    const metadata = asRecord(input);
    if (!metadata) {
      this.say('ALERTS.METADATA_INPUT_INVALID', undefined, 'error', 'metadata-input is not a JSON object.');
      return;
    }
    try {
      await this.importRecord(metadata, this._hostContentType);
      // Read after the import: the host may have set the image meanwhile.
      if (this._hostPreviewImage && !this.canvas.getCurrentState().previewImageUrl) {
        this.canvas.setPreviewImage(this._hostPreviewImage);
      }
    } catch (error) {
      // No record after all (`{ metadata: 'text' }`): the form is untouched (W-34).
      if (error instanceof InvalidRecordError) {
        this.say('ALERTS.METADATA_INPUT_INVALID', undefined, 'error', 'metadata-input is not a JSON object.');
        return;
      }
      console.error('Error loading metadata-input:', error);
      const cause = failureCause(error, this.i18n);
      this.say('ALERTS.METADATA_LOAD_ERROR', { error: cause }, 'error', `Metadata could not be loaded: ${cause}`);
    }
  }
  
  private async refreshContentTypes(): Promise<void> {
    this.contentTypes = await this.schema.getContentTypes();
    this.markForCheck();
  }
  
  // ===== LAYOUT HELPERS =====
  
  /**
   * Determine which layout component to use
   */
  get activeLayout(): LayoutName {
    return this._layoutName in LAYOUT_COMPONENTS ? (this._layoutName as LayoutName) : 'default';
  }

  @ViewChild('layoutHost', { read: ViewContainerRef, static: true })
  private layoutHost!: ViewContainerRef;
  private renderedLayout: LayoutName | null = null;
  private layoutRef: ComponentRef<unknown> | null = null;

  /** Create the active layout, or swap it when the layout input changed. */
  private renderLayout(): void {
    const name = this.activeLayout;
    if (name === this.renderedLayout) return;
    this.layoutRef = createLayout(
      this.layoutHost, LAYOUT_COMPONENTS[name], this.layoutInputs(), this.layoutOutputs()
    );
    this.renderedLayout = name;
  }

  /**
   * A layout created in code (OnPush) re-reads its bindings only when its own
   * view is marked. Everything that changes a bound value marks it through
   * this: the state stream, the element's inputs (ngOnChanges) and the
   * canvas's own changes. Marking it in ngDoCheck checked the whole layout
   * tree on every tick (P-1). The layout's own events mark it themselves.
   */
  private markForCheck(): void {
    this.layoutRef?.changeDetectorRef.markForCheck();
    this.cdr.markForCheck();
  }

  /**
   * What the canvas offers the layout - each layout takes the ones it declares
   * (layout-host.ts). Read on every change detection, like template bindings.
   */
  private layoutInputs(): LayoutInputs {
    return {
      state: () => this.state,
      contentTypes: () => this.contentTypes,
      userText: () => this.userText,
      sourceUrl: () => this.sourceUrl,
      nodeId: () => this.nodeId,
      inputMode: () => this.inputModeValue,
      backgroundColor: () => this.backgroundColor,
      columns: () => this.effectiveColumns,
      flatGroups: () => this._flatGroups,
      groupCollapse: () => this._layout.elements.groupCollapse,
      showInputArea: () => this.effectiveShowInputArea,
      showStatusBar: () => this.effectiveShowStatusBar,
      showCoreFields: () => this.effectiveShowCoreFields,
      showSpecialFields: () => this.effectiveShowSpecialFields,
      showFloatingControls: () => this.effectiveShowFloatingControls,
      showFieldActions: () => this.effectiveShowFieldActions,
      showContentTypeOnly: () => this._showContentTypeOnly,
      showUploadButton: () => this.effectiveShowUploadButton,
      showSaveButton: () => this.effectiveShowSaveButton,
      showJsonLoader: () => this.effectiveShowJsonLoader,
      showLanguageSwitcher: () => this.effectiveShowLanguageSwitcher,
      showContentType: () => this.effectiveShowContentType,
      showResetButton: () => this.effectiveShowResetButton,
      showPageMode: () => this._showPageMode,
      uploading: () => this.uploading,
      readonly: () => this.effectiveReadonly,
      highlightAi: () => this._highlightAi,
      showPreview: () => this._showPreview,
      screenshotEnabled: () => this.state?.screenshotEnabled ?? true,
    };
  }

  /** What the canvas does with a layout's events. */
  private layoutOutputs(): LayoutOutputs {
    return {
      userTextChange: (text: string) => { this.userText = text; },
      sourceUrlChange: (url: string) => { this.sourceUrl = url; },
      nodeIdChange: (nodeId: string) => { this.nodeId = nodeId; },
      // The buttons stay focusable while an extraction runs (aria-disabled, U-1);
      // a click on them then does nothing.
      startExtraction: () => this.whenIdle(() => this.startExtraction()),
      startUrlExtraction: (url: string) => this.whenIdle(() => this.startUrlExtraction(url)),
      startNodeIdExtraction: (nodeId: string) => this.whenIdle(() => this.startNodeIdExtraction(nodeId)),
      inputModeChange: (mode: 'text' | 'url' | 'nodeId') => { this._inputMode = mode; },
      reset: () => this.reset(),
      reloadFromPage: () => this.reloadFromPage.emit(),
      selectContentType: (type: ContentType) => this.selectContentType(type),
      fieldValueChange: (change: { fieldId: string; value: unknown }) =>
        this.canvas.updateFieldValue(change.fieldId, change.value),
      objectEntryChange: (change: { fieldId: string; remove?: number }) =>
        change.remove === undefined
          ? this.canvas.addObjectEntry(change.fieldId)
          : this.canvas.removeObjectEntry(change.fieldId, change.remove),
      jsonLoaded: (data: Record<string, unknown>) => this.onJsonLoaded(data),
      jsonLoadError: () => this.onJsonLoadError(),
      downloadJson: () => this.downloadJson(),
      submit: () => this.submit(),
      upload: () => this.uploadToRepository(),
      cancelExtraction: () => this.canvas.cancelExtraction(),
      dismissError: () => this.canvas.clearError(),
      dismissWarning: () => this.canvas.clearWarning(),
      screenshotToggle: (enabled: boolean) => this.canvas.setScreenshotEnabled(enabled),
    };
  }

  private whenIdle(action: () => void): void {
    if (!this.state?.isExtracting) action();
  }

  /**
   * Get effective element visibility (override ?? layout default)
   */
  get effectiveShowInputArea(): boolean {
    return this._showInputArea ?? this._layout.elements.inputArea;
  }
  
  get effectiveShowStatusBar(): boolean {
    return this._showStatusBar ?? this._layout.elements.statusBar;
  }
  
  get effectiveShowCoreFields(): boolean {
    return this._showCoreFields ?? this._layout.elements.coreFields;
  }
  
  get effectiveShowSpecialFields(): boolean {
    return this._showSpecialFields ?? this._layout.elements.specialFields;
  }
  
  get effectiveShowFloatingControls(): boolean {
    return this._showFloatingControls ?? this._layout.elements.floatingControls;
  }
  
  get effectiveShowFieldActions(): boolean {
    return this._showFieldActions ?? this._layout.elements.fieldActions;
  }
  
  get effectiveShowUploadButton(): boolean {
    return this._showUploadButton ?? this._layout.elements.uploadButton;
  }
  
  get effectiveShowSaveButton(): boolean {
    return this._showSaveButton ?? this._layout.elements.saveButton;
  }
  
  get effectiveShowJsonLoader(): boolean {
    return this._showJsonLoader ?? this._layout.elements.jsonLoader;
  }
  
  get effectiveShowLanguageSwitcher(): boolean {
    return this._showLanguageSwitcher ?? this._layout.elements.languageSwitcher;
  }
  
  get effectiveShowContentType(): boolean {
    return this._showContentType ?? this._layout.elements.contentTypeSelector;
  }
  
  get effectiveShowResetButton(): boolean {
    return this._showResetButton ?? this._layout.elements.floatingResetButton;
  }
  
  get effectiveReadonly(): boolean {
    return this._readonly !== undefined ? this._readonly : this._layout.behavior.readonly;
  }
  
  get effectiveColumns(): 1 | 2 | 3 | 4 {
    return this._columnsOverride ?? this._layout.style.columns;
  }
}
