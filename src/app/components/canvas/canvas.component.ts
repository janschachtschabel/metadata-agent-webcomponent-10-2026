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
import { WidgetDebug } from '../../core/debug';
import { CanvasState, ContentType } from '../../shared/models/canvas.models';
import { LayoutConfig, DEFAULT_LAYOUT } from '../../shared/layouts';
import { LAYOUT_COMPONENTS, LayoutInputs, LayoutName, LayoutOutputs, createLayout } from './layout-host';
import { Notice, WidgetNoticeComponent } from '../shared/widget-notice/widget-notice.component';

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
    }
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
  
  @Input() set readonly(value: boolean | string | undefined) {
    if (value === undefined) return;
    this._readonly = value === true || value === 'true';
  }
  
  @Input() set borderless(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    this._borderless = value === true || value === 'true';
  }
  
  @Input() set flatGroups(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    this._flatGroups = value === true || value === 'true';
  }
  
  @Input() backgroundColor = '';
  
  @Input() set columns(value: number | string | undefined) {
    if (value === undefined || value === null) return;
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
    this._showInputArea = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showStatusBar(value: boolean | string | undefined) {
    this._showStatusBar = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showCoreFields(value: boolean | string | undefined) {
    this._showCoreFields = value === undefined ? undefined : (value !== false && value !== 'false');
  }
  
  @Input() set showSpecialFields(value: boolean | string | undefined) {
    this._showSpecialFields = value === undefined ? undefined : (value !== false && value !== 'false');
  }
  
  @Input() set showFooter(value: boolean | string | undefined) {
    this._showFooter = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showFloatingControls(value: boolean | string | undefined) {
    this._showFloatingControls = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  // Alias for showFloatingControls (OEH compatibility)
  @Input() set controls(value: boolean | string | undefined) {
    this._showFloatingControls = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showFieldActions(value: boolean | string | undefined) {
    this._showFieldActions = value === undefined ? undefined : (value !== false && value !== 'false');
  }
  
  @Input() set showUploadButton(value: boolean | string | undefined) {
    this._showUploadButton = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showSaveButton(value: boolean | string | undefined) {
    this._showSaveButton = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showJsonLoader(value: boolean | string | undefined) {
    this._showJsonLoader = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showLanguageSwitcher(value: boolean | string | undefined) {
    this._showLanguageSwitcher = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showContentType(value: boolean | string | undefined) {
    this._showContentType = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showResetButton(value: boolean | string | undefined) {
    this._showResetButton = value === undefined ? undefined : (value === true || value === 'true');
  }
  
  @Input() set showPreview(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    this._showPreview = value !== false && value !== 'false';
  }

  @Input() set showPageMode(value: boolean | string | undefined) {
    this._showPageMode = value === true || value === 'true';
  }
  
  // OEH compatibility: Show only content type selector in floating controls
  @Input() set showContentTypeOnly(value: boolean | string | undefined) {
    if (value === undefined) return;
    this._showContentTypeOnly = value === true || value === 'true';
  }
  
  // Highlight AI-generated fields with purple text (default: true)
  @Input() set highlightAi(value: boolean | string | undefined) {
    if (value === undefined || value === null) return;
    this._highlightAi = value !== false && value !== 'false';
  }
  
  @Input() metadataInput: Record<string, unknown> | null = null;
  
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
        setTimeout(() => this.triggerAutoExtract(), 0);
      });
    }
  }

  // Programmatic reset without confirmation dialog (for browser plugin)
  @Input() set forceReset(value: boolean | string | number) {
    if (value && String(value) !== 'false' && String(value) !== '0') {
      this.ngZone.run(() => {
        this.canvas.reset();
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
  _showFooter: boolean | undefined = undefined;
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
  _screenshotEnabled = true;
  _screenshotMethod: 'pageshot' | 'playwright' = 'playwright';

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
    private ngZone: NgZone
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
      this.canvas.reset();
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
    setTimeout(() => this.triggerAutoExtract(), 0);
  }

  // ===== LIFECYCLE =====
  
  async ngOnInit(): Promise<void> {
    // All @Input setters have fired by now → safe to render
    this._initialized = true;
    this.renderLayout();

    // Subscribe to state changes (always, even if schema load fails)
    this.canvas.state$.pipe(takeUntil(this.destroy$)).subscribe((state: CanvasState) => {
      this.announceProgress(this.state, state);
      this.state = state;
      // Debounce metadataChange emissions (50ms) to avoid flooding the host page.
      // Skip emission entirely while extracting — the expensive getMetadataForExport()
      // + ngZone.run() would cause full CD cycles that block scrolling.
      // The final emission fires automatically when isExtracting turns false.
      if (this._isPrimary && !state.isExtracting) {
        this.scheduleMetadataChange();
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

    try {
      // Initialize schema context with optional version
      await this.schema.setContext(this._contextName, this._schemaVersion);
      await this.schema.loadCoreSchema();
      
      // Load content types
      this.contentTypes = await this.schema.getContentTypes();
      
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
      this.canvas.setError(translated(this.i18n, 'ALERTS.SCHEMA_INIT_FAILED', { error: cause },
        `Schema initialization failed: ${cause}`));
    }
    
    this.markForCheck();
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    this.markForCheck(); // an input of the element may be bound to the layout
    if (changes['metadataInput']?.currentValue) {
      void this.loadMetadata(changes['metadataInput'].currentValue);
    }
  }
  
  ngOnDestroy(): void {
    // An unanswered question counts as cancelled; its caller must not wait forever.
    this.settleQuestion(false);
    // A pending metadataChange would fire on an element that is gone.
    clearTimeout(this._metadataChangeTimer);
    clearTimeout(this.announceTimer);
    InstanceRegistry.unregister(this._instanceId, this._componentId);
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  // ===== ACTIONS =====
  
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
    // Run outside Angular zone so zone.js doesn't track it as a long task
    this.ngZone.runOutsideAngular(() => setTimeout(async () => {
      const succeeded = await this.canvas.startExtraction(text);
      this.ngZone.run(() => {
        // Emptied only now: cleared up front, a failed request lost the text
        // (U-10). The box is disabled while the run is out, so it still holds
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
    this.ngZone.runOutsideAngular(() => setTimeout(async () => {
      await this.canvas.startNodeIdExtraction(nodeId);
      this.ngZone.run(() => this.markForCheck());
    }));
  }
  
  async selectContentType(contentType: ContentType): Promise<void> {
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
  
  submit(): void {
    const metadata = this.canvas.getMetadataForExport();
    if (this._isPrimary) {
      this.metadataSubmit.emit(metadata);
    }
  }
  
  /** True while an upload runs; the layouts disable their upload button (U-02). */
  uploading = false;

  async uploadToRepository(repository: 'staging' | 'prod' = 'staging'): Promise<void> {
    // A second click while the request is out would create the node twice;
    // during an extraction it would send the form from before the result (L-10).
    if (this.uploading || this.canvas.getCurrentState().isExtracting) return;
    this.uploading = true;
    this.markForCheck();
    try {
      await this.runUpload(repository);
    } finally {
      this.uploading = false;
      this.markForCheck();
    }
  }

  private async runUpload(repository: 'staging' | 'prod'): Promise<void> {
    const metadata = this.canvas.getMetadataForRepository();
    const state = this.canvas.getCurrentState();
    const extendedText = state.userText || undefined;
    
    try {
      const result = await this.apiService.upload({
        metadata,
        repository,
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
            repository,
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
      this.canvas.reset();
      this.userText = '';
    }
  }
  
  // ===== JSON Import/Export =====
  
  downloadJson(): void {
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
  
  async onJsonLoaded(jsonData: Record<string, unknown>): Promise<void> {
    try {
      await this.canvas.importJsonData(jsonData);
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
    this._metadataChangeTimer = setTimeout(() => {
      this.ngZone.run(() => this.metadataChange.emit(this.canvas.getMetadataForExport()));
    }, 50);
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
  private loadMetadata(metadata: Record<string, unknown>): Promise<void> {
    return this.hostTask(() => this.importFromHost(metadata));
  }

  private async importFromHost(metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.canvas.importJsonData(metadata, this._hostContentType);
      // Read after the import: the host may have set the image meanwhile.
      if (this._hostPreviewImage && !this.canvas.getCurrentState().previewImageUrl) {
        this.canvas.setPreviewImage(this._hostPreviewImage);
      }
    } catch (error) {
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
      showInputArea: () => this.effectiveShowInputArea,
      showStatusBar: () => this.effectiveShowStatusBar,
      showCoreFields: () => this.effectiveShowCoreFields,
      showSpecialFields: () => this.effectiveShowSpecialFields,
      showFooter: () => this.effectiveShowFooter,
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
      jsonLoaded: (data: Record<string, unknown>) => this.onJsonLoaded(data),
      jsonLoadError: () => this.onJsonLoadError(),
      downloadJson: () => this.downloadJson(),
      submit: () => this.submit(),
      upload: () => this.uploadToRepository(),
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
  
  get effectiveShowFooter(): boolean {
    return this._showFooter ?? this._layout.elements.footer;
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
