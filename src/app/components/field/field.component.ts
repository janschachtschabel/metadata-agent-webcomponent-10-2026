import { 
  Component, 
  Directive,
  Input, 
  Output, 
  EventEmitter, 
  Injectable,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  forwardRef,
  inject
} from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocomplete, MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatDatepicker, MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepicker, MatTimepickerModule } from '@angular/material/timepicker';
import { MAT_DATE_LOCALE, MAT_DATE_FORMATS, DateAdapter, NativeDateAdapter, ErrorStateMatcher } from '@angular/material/core';
import { MatRadioModule } from '@angular/material/radio';
import { TextFieldModule } from '@angular/cdk/text-field';

import { CanvasFieldState, FieldStatus } from '../../shared/models/canvas.models';
import { FieldValidationService, VocabularyDef } from '../../core/field-validation.service';
import { sameValue } from '../../core/canvas-fields';
import { holdInput } from '../../core/pending-inputs';
import { VocabTreePickerComponent } from '../shared/vocab-tree-picker/vocab-tree-picker.component';
import { SvgIconComponent } from '../shared/svg-icon/svg-icon.component';
import { uniqueId } from '../../shared/unique-id';
import { isIsoDate, keepSecondsAndOffset, parseDate, parseDateTime } from '../../core/date-parsing';
import { WidgetDatepickerIntl } from '../../core/widget-datepicker-intl';

const DATE_FORMATS = {
  parse: { dateInput: 'DD.MM.YYYY', timeInput: 'HH:MM' },
  display: {
    dateInput: { day: '2-digit', month: '2-digit', year: 'numeric' } as Intl.DateTimeFormatOptions,
    monthYearLabel: { month: 'long', year: 'numeric' } as Intl.DateTimeFormatOptions,
    dateA11yLabel: { day: 'numeric', month: 'long', year: 'numeric' } as Intl.DateTimeFormatOptions,
    monthYearA11yLabel: { month: 'long', year: 'numeric' } as Intl.DateTimeFormatOptions,
    timeInput: { hour: '2-digit', minute: '2-digit', hour12: false } as Intl.DateTimeFormatOptions,
    timeOptionLabel: { hour: '2-digit', minute: '2-digit', hour12: false } as Intl.DateTimeFormatOptions,
  }
};

/** Day first in both languages: 03.05.2026 in German, 03/05/2026 in English (en-GB). */
function dateSeparator(locale: unknown): string {
  return String(locale).startsWith('en') ? '/' : '.';
}

/**
 * The actions of one entry of an object list (a venue of an event), shown
 * below the entry's last input (audit 14.11., W-42).
 */
export interface ObjectEntryControls {
  /** The object list field the entry belongs to, and its name for the buttons. */
  parentId: string;
  parentLabel: string;
  /** Position of the entry in the list (the arrayIndex of its subfields). */
  index: number;
  /** The last entry: "add" follows it. */
  last: boolean;
  /** Not for the one entry form of a list nobody filled: there is nothing to remove. */
  removable: boolean;
}

/** What a button of an entry asks for: a new entry, or the removal of the one at `remove`. */
export interface ObjectEntryChange {
  fieldId: string;
  remove?: number;
}

/** Datatypes whose values a read-only view shows as links (U-02). */
const LINK_DATATYPES = ['url', 'uri'];

/** Special datatypes whose lists are entered item by item as chips (W-L4). */
const MULTI_VALUE_SCALARS = ['date', 'datetime', 'time', 'number', 'integer', 'url', 'uri', 'duration'];

/**
 * Dates follow the widget language (audit U-14). FieldComponent sets the
 * locale on every language switch; it used to be fixed to de-DE.
 */
@Injectable()
class WidgetDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: object): string {
    if (displayFormat === DATE_FORMATS.display.dateInput) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const sep = dateSeparator(this.locale);
      return `${day}${sep}${month}${sep}${year}`;
    }
    return super.format(date, displayFormat);
  }

  /**
   * Typed text only as DD.MM.YYYY, DD/MM/YYYY or ISO, and only a real day
   * (W-L3); anything else is an invalid date, which the field reports. The
   * native fallback guessed ("1" → 2001-01-01) and rolled 31.02. over.
   */
  override parse(value: any): Date | null {
    if (typeof value === 'string') {
      if (!value.trim()) return null;
      const date = parseDate(value);
      return date ? new Date(date.year, date.month - 1, date.day) : this.invalid();
    }
    return super.parse(value);
  }

  override getFirstDayOfWeek(): number {
    return 1; // Monday
  }
}

/**
 * Hands a calendar, clock or autocomplete to its field when it is created.
 *
 * They are created only for the fields that need them (audit 14.11., U-18) -
 * every field used to carry two calendars, two clocks and an autocomplete.
 * That puts each one into an @if block, where a template reference does not
 * reach the toggle button: it sits in the form field's suffix slot, a block
 * of its own. The field hands the instance on; it is set while the block is
 * created, before the toggle's bindings are read.
 */
@Directive({ selector: 'mat-datepicker[appFieldPart], mat-timepicker[appFieldPart], mat-autocomplete[appFieldPart]', standalone: true })
export class FieldPartDirective {
  constructor() {
    const field = inject<FieldComponent>(forwardRef(() => FieldComponent));
    field.calendar = inject(MatDatepicker, { self: true, optional: true }) ?? field.calendar;
    field.clock = inject(MatTimepicker, { self: true, optional: true }) ?? field.clock;
    field.autocomplete = inject(MatAutocomplete, { self: true, optional: true }) ?? field.autocomplete;
  }
}

@Component({
  selector: 'app-field',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatRadioModule,
    TextFieldModule,
    VocabTreePickerComponent,
    SvgIconComponent,
    FieldPartDirective
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'de-DE' },
    { provide: DateAdapter, useClass: WidgetDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: DATE_FORMATS },
    // The calendar's texts in the widget language; one instance for all fields (U-06).
    { provide: MatDatepickerIntl, useExisting: WidgetDatepickerIntl }
  ],
  templateUrl: './field.component.html',
  styleUrls: ['./field.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FieldComponent implements OnInit, OnChanges, OnDestroy {
  @Input() field!: CanvasFieldState;
  @Input() readonly = false;
  @Input() highlightAi = true;
  /** Set on the last input of an entry of an object list (W-42). */
  @Input() entry: ObjectEntryControls | null = null;
  
  @Output() valueChange = new EventEmitter<unknown>();
  @Output() entryChange = new EventEmitter<ObjectEntryChange>();
  @ViewChild('autoTrigger') autocompleteTrigger?: MatAutocompleteTrigger;
  /** Calendar, clock and autocomplete of this field, where its datatype has one (FieldPartDirective). */
  calendar?: MatDatepicker<Date>;
  clock?: MatTimepicker<Date>;
  autocomplete?: MatAutocomplete;
  
  FieldStatus = FieldStatus;
  
  // Local input value for editing (always empty for array fields)
  inputValue = '';
  /** The text the input shows for the field's value; '' when it shows none. */
  private shownValue = '';
  dateValue: Date | null = null;
  dateTimeTimeValue = '00:00';
  /** The field's time of day for the clock, which opens on it; null without one. */
  clockValue: Date | null = null;
  filteredOptions: string[] = [];
  
  // Tree picker state
  pickerOpen = false;
  /** Id of this field's picker dialog (aria-controls); unique across widget instances. */
  readonly pickerId = uniqueId('vocab-picker');
  
  // Validation state
  validationError: string | null = null;
  validationWarning: string | null = null;

  /** Id of the text below the field (error, warning or hint), for aria-describedby. */
  readonly supportId = uniqueId('field-support');
  /** Id of the field's description below it, for aria-describedby (U-01). */
  readonly descriptionId = uniqueId('field-description');

  /**
   * Material's error state follows this field's own validation (U-12): the
   * input gets aria-invalid and the red outline whenever an error is shown.
   * The ngModel controls never enter Material's error state on their own.
   */
  readonly errorMatcher: ErrorStateMatcher = { isErrorState: () => !!this.validationError };

  private blurTimer: ReturnType<typeof setTimeout> | undefined;
  /** Withdraws the delayed blur from the pending inputs (pending-inputs.ts). */
  private releaseInput: (() => void) | undefined;

  // Cached template properties (recomputed only in ngOnChanges, not every CD cycle)
  _isRadioField = false;
  _useTreePicker = false;
  _isSpecialDatatype = false;
  /** A list of dates, addresses, numbers...: entered and shown as chips (W-L4). */
  _chipInput = false;
  _hasVocabulary = false;
  _statusClass = '';
  _radioOptions: { label: string; value: string | boolean }[] = [];
  _radioValue: unknown = null;
  _selectedValues: string[] = [];
  /**
   * The values of a list field with the text of their chip. Computed when the
   * field changes: the template asked for the text of every chip twice on
   * every change detection, a search through the vocabulary each (W-N).
   */
  _chips: { value: unknown; label: string }[] = [];
  /**
   * What a read-only view shows: the value as text, one entry per value, a
   * web address with its link (audit 14.11., U-02).
   */
  _readonlyItems: { text: string; href: string | null }[] = [];
  /** A list field, or several values where one was expected: shown as a list. */
  _readonlyAsList = false;
  
  // Pre-resolved placeholder texts (avoids translate pipe issues in property bindings
  // under OnPush ancestors, e.g. in browser extension web-component context)
  placeholderVocabPicker = '';
  placeholderArrayInput = '';
  placeholderDate = '';
  placeholderDateTime = '';
  placeholderDuration = '';
  private i18nSubs: Subscription[] = [];
  
  constructor(
    private cdr: ChangeDetectorRef,
    private validation: FieldValidationService,
    private translate: TranslateService,
    private elRef: ElementRef<HTMLElement>,
    private dateAdapter: DateAdapter<Date>
  ) {}

  ngOnInit(): void {
    this.dateAdapter.setLocale(this.dateLocale);
    this.updateInputValue();
    this.updateFilteredOptions();
    this.resolveTranslatedPlaceholders();
    // Re-resolve when translations arrive or language changes
    this.i18nSubs.push(
      this.translate.onTranslationChange.subscribe(() => {
        this.resolveTranslatedPlaceholders();
        this.updateTranslatedOptions();
        this.cdr.markForCheck();
      }),
      this.translate.onLangChange.subscribe(() => {
        this.dateAdapter.setLocale(this.dateLocale);
        this.updateInputValue();
        this.updateTranslatedOptions();
        this.resolveTranslatedPlaceholders();
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.i18nSubs.forEach(s => s.unsubscribe());
    // The delayed blur check would emit for a field that is gone.
    this.dropPendingBlur();
  }

  /**
   * "Ja"/"Nein" and what a read-only view shows are put into words when the
   * field changes - and when the language or its texts do: they stayed in
   * the language of the moment the field was built (audit 14.11., U-21).
   */
  private updateTranslatedOptions(): void {
    this._radioOptions = this.getRadioOptions();
    this.updateReadonlyItems();
  }

  private get dateLocale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-GB' : 'de-DE';
  }

  private resolveTranslatedPlaceholders(): void {
    this.placeholderVocabPicker = this.translate.instant('FIELD.VOCAB_OPEN_PICKER');
    this.placeholderArrayInput = this.translate.instant('FIELD.ARRAY_PLACEHOLDER');
    this.placeholderDate = this.translate.instant('FIELD.DATE_PLACEHOLDER');
    this.placeholderDateTime = this.translate.instant('FIELD.DATETIME_PLACEHOLDER');
    this.placeholderDuration = this.translate.instant('FIELD.DURATION_PLACEHOLDER');
  }

  /**
   * Ids for aria-describedby: the description, and the support text (error,
   * warning, required or vocabulary hint) while one is shown below the field
   * (U-12). The conditions mirror the four support-text blocks in the
   * template, of which one shows at most. '' rather than null when there is
   * nothing: MatInput's aria-describedby input is typed as string.
   */
  get describedBy(): string {
    const f = this.field;
    const shown = !!this.validationError
      || !!this.validationWarning
      || (f.isRequired && f.status === FieldStatus.EMPTY)
      || (f.vocabulary?.type === 'closed' && !f.isRequired && f.status === FieldStatus.EMPTY);
    return [f.description ? this.descriptionId : '', shown ? this.supportId : ''].filter(Boolean).join(' ');
  }

  /** The AI origin, also as icon and text: colour alone does not reach everyone (U-16). */
  get showAiOrigin(): boolean {
    return this.highlightAi && !!this.field.isAiGenerated && this.field.status === FieldStatus.FILLED;
  }
  
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['field']) {
      this.updateInputValue();
      this.updateFilteredOptions();
      this.updateCachedProperties();
    }
  }

  /** Recompute all cached template properties when field changes */
  private updateCachedProperties(): void {
    this._isRadioField = this.isRadioField();
    this._useTreePicker = this.useTreePicker();
    this._chipInput = this.isMultiValuedScalar();
    this._isSpecialDatatype = this.isSpecialDatatype() && !this._chipInput;
    this._hasVocabulary = this.hasVocabulary();
    this._statusClass = this.getStatusClass();
    this._radioOptions = this.getRadioOptions();
    this._radioValue = this.getRadioValue();
    this._selectedValues = this.getSelectedValues();
    this._chips = this.isListField ? this.listValue().map(value => ({ value, label: this.getChipDisplayValue(value) })) : [];
    this.updateReadonlyItems();
  }

  /** After updateInputValue and the radio options: it shows what they hold. */
  private updateReadonlyItems(): void {
    const value = this.field.value;
    this._readonlyAsList = this.isListField || Array.isArray(value);
    if (this._readonlyAsList) {
      this._readonlyItems = this.listValue().map(item => this.readonlyItem(item, this.getChipDisplayValue(item)));
    } else if (value === null || value === undefined || value === '') {
      this._readonlyItems = [];
    } else {
      this._readonlyItems = [this.readonlyItem(value, this.readonlyText(value))];
    }
  }

  /** The text an edit control would show for the value: the option's label, the date as typed, the label of a concept. */
  private readonlyText(value: unknown): string {
    if (this._isRadioField) {
      const option = this._radioOptions.find(o => o.value === this._radioValue);
      if (option) return option.label;
    }
    if (this.field.datatype === 'date' && this.dateValue) {
      return this.dateAdapter.format(this.dateValue, DATE_FORMATS.display.dateInput);
    }
    return this.inputValue || this.getChipDisplayValue(value);
  }

  /**
   * A link only for an http(s) address shown as itself in a URL field: not for
   * a concept shown by its label, an address inside a text, or another scheme.
   */
  private readonlyItem(value: unknown, text: string): { text: string; href: string | null } {
    const address = typeof value === 'string' ? value.trim() : '';
    const urlField = LINK_DATATYPES.includes(this.field.datatype) || LINK_DATATYPES.includes(this.field.itemDatatype ?? '');
    const linked = urlField && text.trim() === address && /^https?:\/\/\S+$/i.test(address);
    return { text, href: linked ? address : null };
  }

  /** A field that holds a list, shown as chips. */
  private get isListField(): boolean {
    return !!this.field.multiple || this.field.datatype === 'array';
  }

  /**
   * The value of a list field as a list. A single value stored there (an
   * older record, an import) is its only entry: it is shown as a chip and
   * kept when the editor adds another - the chips looped over the text
   * itself, which Angular refuses (audit 14.11., W-43).
   */
  private listValue(): unknown[] {
    const value = this.field.value;
    if (Array.isArray(value)) return value;
    return value === null || value === undefined || value === '' ? [] : [value];
  }

  /**
   * Says so when the stored value does not fit the field and its control
   * cannot show it: the control stayed empty while the value stayed in the
   * record and counted as filled (audit 14.11., W-43). Nothing is converted -
   * which of several values is meant, or which date "03.05.2026" names in a
   * record from elsewhere, is the editor's decision. The message names the
   * value; it goes when the editor enters one.
   */
  private showMismatch(): void {
    const mismatch = this.valueMismatch();
    if (mismatch) {
      this.validationError = mismatch;
      this.mismatchShown = true;
    } else if (this.mismatchShown) {
      this.validationError = null;
      this.mismatchShown = false;
    }
  }
  private mismatchShown = false;

  private valueMismatch(): string | null {
    const value = this.field.value;
    if (value === null || value === undefined || value === '') return null;
    if (Array.isArray(value)) {
      if (this.isListField || value.length === 0) return null;
      const values = value.map(item => this.getChipDisplayValue(item)).join(', ');
      return this.text('VALIDATION.STORED_LIST_ON_SINGLE', { values },
        `The record holds several values here (${values}), but this field takes only one. Please enter the one that applies.`);
    }
    if (this.isListField) return null; // one entry of the list, shown as a chip
    const unreadable =
      (this.field.datatype === 'date' && !isIsoDate(String(value))) ||
      ((this.field.datatype === 'number' || this.field.datatype === 'integer')
        && typeof value !== 'number' && Number.isNaN(Number(value)));
    return unreadable
      ? this.text('VALIDATION.STORED_VALUE_UNREADABLE', { value: String(value) },
        `The stored value “${String(value)}” does not fit this field and is not shown in it. Please enter it again.`)
      : null;
  }

  /** A translation, or `fallback` while the agent serves texts without this key. */
  private text(key: string, params: Record<string, unknown>, fallback: string): string {
    const translated = this.translate.instant(key, params);
    return translated && translated !== key ? translated : fallback;
  }

  private updateInputValue(): void {
    // For array fields, input is always empty (values shown as chips)
    if (Array.isArray(this.field.value) || this.isListField) {
      this.inputValue = '';
    } else if (this.field.datatype === 'time' && this.field.value) {
      // Extract HH:MM from any format (ISO datetime, plain time, etc.)
      const timeMatch = String(this.field.value).match(/(\d{2}):(\d{2})/);
      this.inputValue = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : String(this.field.value);
    } else if (this.field.datatype === 'datetime' && this.field.value) {
      // Format datetime in the widget language ("DD.MM.YYYY HH:MM" / "DD/MM/YYYY HH:MM")
      this.inputValue = this.formatDateTime(String(this.field.value));
      // Extract time part for timepicker
      const timeMatch = String(this.field.value).match(/(\d{2}):(\d{2})/);
      this.dateTimeTimeValue = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '00:00';
    } else if (this.field.value !== null && this.field.value !== undefined) {
      // Translate URI to label if vocabulary exists
      this.inputValue = this.getChipDisplayValue(this.field.value);
    } else {
      this.inputValue = '';
    }
    this.shownValue = this.inputValue;
    this.clockValue = this.timeOfDay(this.field.datatype === 'datetime' ? this.dateTimeTimeValue : this.inputValue);
    // Parse date string to Date object for mat-datepicker (date-only fields)
    if (this.field.datatype === 'date' && this.field.value) {
      const stored = String(this.field.value).trim();
      this.dateValue = isIsoDate(stored) ? new Date(`${stored}T00:00:00`) : null;
    } else if (this.field.datatype !== 'datetime') {
      this.dateValue = null;
    }
    this.showMismatch();
  }

  private formatDateTime(val: string): string {
    const sep = dateSeparator(this.dateLocale);
    // Parse ISO "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM" into "DD.MM.YYYY HH:MM"
    const match = val.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (match) {
      return `${match[3]}${sep}${match[2]}${sep}${match[1]} ${match[4]}:${match[5]}`;
    }
    // Try date-only "YYYY-MM-DD"
    const dateMatch = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      return `${dateMatch[3]}${sep}${dateMatch[2]}${sep}${dateMatch[1]} 00:00`;
    }
    // Already in display format or unrecognized — return as-is
    return val;
  }

  private updateFilteredOptions(): void {
    if (this.field.vocabulary?.concepts) {
      this.filteredOptions = this.field.vocabulary.concepts.map((c: any) => {
        if (typeof c.label === 'string') return c.label;
        return c.label?.['de'] || c.label?.['en'] || '';
      });
    }
  }
  
  onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.inputValue = target.value;
    this.validationError = null;
    this.validationWarning = null;
    
    // Filter autocomplete options using validation service
    if (this.field.vocabulary?.concepts) {
      const vocab = this.getVocabularyDef();
      if (vocab) {
        this.filteredOptions = this.validation.getAutocompleteSuggestions(
          this.inputValue, 
          vocab, 
          10
        );
      }
    }
  }
  
  /**
   * Get vocabulary definition for validation
   * SKOS vocabularies are also treated as closed (controlled) vocabularies
   */
  private getVocabularyDef(): VocabularyDef | null {
    if (!this.field.vocabulary?.concepts) return null;
    // Both 'closed' and 'skos' are treated as controlled vocabularies
    const vocabType = this.field.vocabulary.type;
    const isClosed = vocabType === 'closed' || vocabType === 'skos';
    return {
      type: isClosed ? 'closed' : 'open',
      concepts: this.field.vocabulary.concepts.map((c: any) => ({
        uri: c.uri,
        value: c.value,
        label: c.label,
        altLabels: c.altLabels,
        description: c.description
      }))
    };
  }
  
  onBlur(): void {
    this.dropPendingBlur();
    // Taken at once: a click on "Hochladen" right after typing read the form
    // before a delayed value was in it (W-LOG-01). Only an open autocomplete
    // panel needs the delay - a click on one of its options blurs the input
    // first, and the typed fragment must not get ahead of the chosen option.
    if (!this.autocompleteTrigger?.panelOpen) {
      this.commitInput();
      return;
    }
    const commit = () => {
      this.dropPendingBlur();
      this.commitInput();
    };
    this.blurTimer = setTimeout(commit, 200);
    this.releaseInput = holdInput(commit);
  }

  private commitInput(): void {
    if (this.inputValue.trim()) {
      this.processInputValue();
    } else if (this.shownValue && !(this.field.multiple || this.field.datatype === 'array')) {
      // Emptied by the editor: the value is gone (W-LOG-02). Not for a list,
      // whose input is only the draft of the next chip, and not for a value
      // the input never showed - leaving it is no change (L-01).
      this.validationError = null;
      this.valueChange.emit(null);
      this.cdr.markForCheck();
    } else if (this.mismatchShown && !this.validationError) {
      // Typed and deleted again: the stored value still does not fit (W-43).
      this.showMismatch();
      this.cdr.markForCheck();
    }
  }

  private dropPendingBlur(): void {
    clearTimeout(this.blurTimer);
    this.releaseInput?.();
    this.releaseInput = undefined;
  }
  
  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      // ngModel writes to the textarea only when its binding changed since the
      // last change detection. Without a run since the typing (it is coalesced),
      // the binding still holds '' and resetting inputValue to '' left the
      // typed word in the textarea next to its new chip.
      this.cdr.detectChanges();
      this.processInputValue();
    }
  }
  
  private processInputValue(): void {
    const value = this.inputValue.trim();
    if (!value) return;
    
    // Validate the input
    const result = this.validation.validate(value, {
      datatype: this.field.datatype || 'string',
      // Without these two, `datatype: 'array'` tells the validator nothing about
      // its elements and every item is checked as a string — which is how a bare
      // name passed as a valid schema:contactPoint.
      itemDatatype: this.field.itemDatatype,
      objectKey: this.field.objectKey,
      required: this.field.isRequired,
      multiple: this.field.multiple,
      vocabulary: this.getVocabularyDef() || undefined
    });
    
    // Handle validation result. markForCheck in every branch: onBlur calls this
    // from a setTimeout, which does not mark an OnPush view dirty by itself.
    if (!result.valid) {
      this.validationError = result.error || null;
      // For closed vocabulary: reset to previous valid value on rejection
      const vocabDef = this.getVocabularyDef();
      if (vocabDef?.type === 'closed') {
        // Revert to the current field value display
        this.inputValue = this.field.value ? this.getChipDisplayValue(this.field.value) : '';
      }
      this.cdr.markForCheck();
      return; // Don't emit invalid values
    }
    
    this.validationWarning = result.warning || null;
    this.cdr.markForCheck();
    const normalizedValue = result.normalizedValue ?? value;
    
    if (this.field.multiple || this.field.datatype === 'array') {
      // Add to array
      const currentValues = [...this.listValue()];
      const newValues = Array.isArray(normalizedValue) 
        ? normalizedValue.filter(v => !currentValues.includes(v))
        : [normalizedValue].filter(v => !currentValues.includes(v));
      
      if (newValues.length > 0) {
        this.valueChange.emit([...currentValues, ...newValues]);
      }
      this.inputValue = '';
      this.cdr.markForCheck();
    } else {
      // Update input display with normalized/corrected value. Leaving a field
      // without a change emits nothing: during a run the canvas would take it
      // for an edit and keep the field against the AI value (L-01).
      this.inputValue = this.getChipDisplayValue(normalizedValue);
      if (!sameValue(normalizedValue, this.field.value)) {
        this.valueChange.emit(normalizedValue);
      }
      this.cdr.markForCheck();
    }
  }
  
  selectOption(option: string): void {
    // Resolve the selected label to its canonical value (URI if available)
    const resolvedValue = this.resolveVocabValue(option);
    
    if (this.field.multiple || this.field.datatype === 'array') {
      const currentValues = [...this.listValue()];
      if (!currentValues.includes(resolvedValue)) {
        this.valueChange.emit([...currentValues, resolvedValue]);
      }
      // Clear input after selection
      setTimeout(() => {
        this.inputValue = '';
        this.validationError = null;
        this.updateFilteredOptions();
        this.cdr.markForCheck();
      }, 0);
    } else {
      this.inputValue = option; // Display the label
      this.validationError = null;
      this.valueChange.emit(resolvedValue);
      this.cdr.markForCheck();
    }
  }
  
  /**
   * Resolve a vocabulary label to its canonical value (URI or label)
   */
  private resolveVocabValue(label: string): string {
    if (!this.field.vocabulary?.concepts) return label;
    
    const concept = this.field.vocabulary.concepts.find((c: any) => {
      const conceptLabel = typeof c.label === 'string' ? c.label : (c.label?.['de'] || c.label?.['en'] || '');
      return conceptLabel === label || conceptLabel.toLowerCase() === label.toLowerCase();
    });
    
    if (concept) {
      const hasUris = this.field.vocabulary.concepts.some((c: any) => c.uri);
      if (hasUris && concept.uri) return concept.uri;
    }
    return label;
  }
  
  removeChip(item: any): void {
    this.valueChange.emit(this.listValue().filter(v => v !== item));
  }
  
  onDateChange(event: any): void {
    const date: Date | null = event.value;
    // Material hands over null for text it cannot read as well as for an empty
    // input; only the input's own text tells them apart.
    const typed = String(event.targetElement?.value ?? '').trim();
    if ((date instanceof Date && isNaN(date.getTime())) || (!date && typed)) {
      // Typed text the adapter could not read: say so instead of dropping it (W-L3).
      this.validationError = this.translate.instant('VALIDATION.INVALID_DATE');
      this.cdr.markForCheck();
      return;
    }
    if (!date) {
      // Emptied by the editor (W-LOG-02); without a value before, no change (L-01).
      this.validationError = '';
      if (!sameValue(null, this.field.value)) this.valueChange.emit(null);
      this.cdr.markForCheck();
      return;
    }
    if (date instanceof Date && !isNaN(date.getTime())) {
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      this.inputValue = iso;
      this.valueChange.emit(iso);
      this.validationError = '';
    }
  }

  /**
   * A time typed into the time field (U-14). The field was read-only, so the
   * clock dial was the only way in; it stays available from the toggle.
   */
  onTimeTyped(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) {
      this.validationError = null;
      this.valueChange.emit(null);
      return;
    }
    const match = trimmed.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!match || +match[1] > 23 || +match[2] > 59) {
      this.validationError = this.translate.instant('VALIDATION.INVALID_TIME');
      this.cdr.markForCheck();
      return;
    }
    const time = `${match[1].padStart(2, '0')}:${match[2]}`;
    this.inputValue = time;
    this.validationError = null;
    this.valueChange.emit(time);
    this.cdr.markForCheck();
  }

  /** `HH:MM` as a time of today, for the clock; null for anything else. */
  private timeOfDay(text: string): Date | null {
    const match = this.field.value ? /^(\d{1,2}):(\d{2})$/.exec(text) : null;
    if (!match || +match[1] > 23 || +match[2] > 59) return null;
    const time = new Date();
    time.setHours(+match[1], +match[2], 0, 0);
    return time;
  }

  /** A time picked from the clock's list, as the `HH:MM` the field stores. */
  private pickedTime(time: Date): string {
    return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
  }

  onTimePicked(time: Date): void {
    this.onTimeStringChange(this.pickedTime(time));
    this.cdr.markForCheck();
  }

  onDateTimeTimePicked(time: Date): void {
    this.onDateTimeTimeChange(this.pickedTime(time));
    this.cdr.markForCheck();
  }

  /**
   * The clock closed: the focus goes to the field's own input. The clock
   * leaves it on its anchor, which nobody sees - after a choice it puts it
   * there once more when it has told us, hence a moment later.
   */
  focusInput(): void {
    void Promise.resolve().then(() => this.elRef.nativeElement.querySelector<HTMLElement>('input[matInput]')?.focus());
  }

  onTimeStringChange(timeStr: string): void {
    if (timeStr) {
      this.inputValue = timeStr;
      this.valueChange.emit(timeStr);
      this.validationError = '';
    }
  }

  onDateTimeBlur(): void {
    // Only a change is emitted (L-01, see processInputValue).
    if (!this.inputValue) {
      if (!sameValue(null, this.field.value)) this.valueChange.emit(null);
      return;
    }
    // Untouched: no edit, whatever the value. The display drops seconds and
    // offset ("…T10:00:00+02:00"); parsing it back would lose them and mark
    // the AI value as typed. An unparseable AI value stays quiet as well.
    if (this.inputValue === this.formatDateTime(String(this.field.value ?? ''))) {
      this.validationError = '';
    } else {
      const typed = parseDateTime(this.inputValue);
      if (typed) {
        const iso = keepSecondsAndOffset(typed, this.field.value);
        this.inputValue = this.formatDateTime(iso);
        if (!sameValue(iso, this.field.value)) this.valueChange.emit(iso);
        this.validationError = '';
      } else {
        // Typed and not a date-time (31.02., 25:99, "morgen"): say so and keep
        // the field value (W-L2).
        this.validationError = this.translate.instant('VALIDATION.INVALID_DATETIME');
      }
    }
    this.cdr.markForCheck();
  }

  onDateTimePickerSelect(event: any): void {
    const date: Date | null = event.value;
    if (!(date instanceof Date) || isNaN(date.getTime())) return;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    // Preserve existing time part, default 00:00
    const timeMatch = this.inputValue?.match(/(\d{1,2}):(\d{2})/);
    const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : '00:00';
    const sep = dateSeparator(this.dateLocale);
    this.inputValue = `${day}${sep}${month}${sep}${year} ${time}`;
    this.dateTimeTimeValue = time;
    this.valueChange.emit(keepSecondsAndOffset(`${year}-${month}-${day}T${time}`, this.field.value));
    this.validationError = '';
  }

  onDateTimeTimeChange(timeStr: string): void {
    if (!timeStr) return;
    // Parse current datetime to get the date part
    const currentIso = parseDateTime(this.inputValue);
    let datePart: string;
    if (currentIso) {
      datePart = currentIso.split('T')[0];
    } else {
      // No date yet — use today
      const today = new Date();
      datePart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }
    // Normalize time to HH:MM (strip seconds if present)
    const tMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    const normalizedTime = tMatch ? `${tMatch[1].padStart(2, '0')}:${tMatch[2]}` : timeStr;
    const newIso = keepSecondsAndOffset(`${datePart}T${normalizedTime}`, this.field.value);
    this.inputValue = this.formatDateTime(newIso);
    this.dateTimeTimeValue = normalizedTime;
    this.valueChange.emit(newIso);
    this.validationError = '';
  }

  
  // ===== Helpers =====
  
  private formatSingleValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    
    // Handle objects
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      
      // Location object
      if (obj['name'] && obj['address']) {
        const addr = obj['address'] as Record<string, unknown>;
        return `${obj['name']} (${addr?.['addressLocality'] || ''})`;
      }
      
      // Schedule/openingHours object
      if (obj['startDate'] || obj['opens']) {
        const date = (obj['startDate'] || obj['validFrom'] || '') as string;
        const time = obj['opens'] ? `${obj['opens']}-${obj['closes']}` : '';
        const dayOfWeek = obj['dayOfWeek'] as string[] | undefined;
        const byDay = obj['byDay'] as string[] | undefined;
        const days = dayOfWeek?.join(', ') || byDay?.join(', ') || '';
        return [date, time, days].filter(Boolean).join(' ');
      }
      
      // Actor/person object
      if (obj['name'] && !obj['address']) {
        return obj['name'] as string;
      }
      
      // Generic object with name/description
      if (obj['name']) return obj['name'] as string;
      if (obj['description']) return obj['description'] as string;
      
      // Fallback: show key properties
      const keys = Object.keys(obj).slice(0, 3);
      const summary = keys.map(k => `${k}: ${obj[k]}`).join(', ');
      return summary || JSON.stringify(obj);
    }
    
    return String(value);
  }
  
  getStatusClass(): string {
    const classes: string[] = [];
    
    switch (this.field.status) {
      case FieldStatus.FILLED:
        classes.push('status-filled');
        break;
      default:
        classes.push(this.field.isRequired ? 'status-required' : 'status-empty');
    }
    
    if (this.highlightAi && this.field.isAiGenerated && this.field.status === FieldStatus.FILLED) {
      classes.push('ai-generated');
    }
    
    return classes.join(' ');
  }
  
  hasVocabulary(): boolean {
    return !!this.field.vocabulary?.concepts?.length;
  }

  /**
   * Check if field should use the tree picker instead of autocomplete dropdown.
   * Used for vocabularies with >= 5 concepts or hierarchical vocabularies.
   */
  useTreePicker(): boolean {
    if (!this.field.vocabulary?.concepts?.length) return false;
    if (this.isRadioField()) return false;
    if (this.isSpecialDatatype()) return false;
    const isHierarchical = !!(this.field.vocabulary as any).hierarchical;
    const hasManyOptions = this.field.vocabulary.concepts.length >= 5;
    return isHierarchical || hasManyOptions;
  }

  /** Enter, Space or Arrow down open the picker, as on a native select. */
  onPickerKeydown(event: KeyboardEvent): void {
    if (this.pickerOpen) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.openPicker();
    }
  }

  openPicker(): void {
    this.pickerOpen = true;
  }

  /** Close and put the focus back on the field, so keyboard users keep their place. */
  closePicker(): void {
    this.pickerOpen = false;
    const trigger = this.elRef.nativeElement.querySelector<HTMLElement>('.picker-display-input');
    setTimeout(() => trigger?.focus());
  }

  getSelectedValues(): string[] {
    if (!this.field.value) return [];
    if (Array.isArray(this.field.value)) return this.field.value;
    return [this.field.value];
  }

  onTreeSelectionChange(selected: string[]): void {
    if (this.field.multiple || this.field.datatype === 'array') {
      this.valueChange.emit(selected);
    } else {
      this.valueChange.emit(selected.length > 0 ? selected[0] : null);
      // For single-select, close the picker after selection
      if (selected.length > 0) {
        this.closePicker();
      }
    }
    this.validationError = null;
  }
  
  /**
   * Check if field should render as radio buttons
   * Auto-detect: boolean fields OR closed vocabulary with ≤ 4 concepts and single-select
   */
  isRadioField(): boolean {
    if (this.field.datatype === 'boolean') return true;
    if (!this.field.vocabulary?.concepts) return false;
    if (this.field.vocabulary.type !== 'closed') return false;
    if (this.field.multiple || this.field.datatype === 'array') return false;
    return this.field.vocabulary.concepts.length >= 2 && this.field.vocabulary.concepts.length <= 4;
  }

  /**
   * Get radio options from vocabulary concepts or boolean values
   */
  getRadioOptions(): { label: string; value: string | boolean }[] {
    if (this.field.datatype === 'boolean') {
      // Real booleans, as the agent sends and expects them (W-LOG-07).
      return [
        { label: this.translate.instant('FIELD.BOOLEAN.TRUE'), value: true },
        { label: this.translate.instant('FIELD.BOOLEAN.FALSE'), value: false }
      ];
    }
    if (!this.field.vocabulary?.concepts) return [];
    return this.field.vocabulary.concepts.map((c: any) => {
      const label = typeof c.label === 'string' ? c.label : (c.label?.['de'] || c.label?.['en'] || '');
      const value = c.uri || label;
      return { label, value };
    });
  }

  /**
   * The value the radio group selects by. A boolean stored as text ('true',
   * 'ja' - older records, imports) selects its option like the boolean (W-LOG-07).
   */
  private getRadioValue(): unknown {
    const value = this.field.value;
    if (this.field.datatype !== 'boolean' || typeof value !== 'string') return value;
    const result = this.validation.validate(value, { datatype: 'boolean' });
    return result.valid ? result.normalizedValue : value;
  }

  onRadioChange(value: string | boolean | null): void {
    this.valueChange.emit(value);
    this.validationError = null;
  }

  /**
   * Check if field has a special datatype with dedicated input
   */
  isSpecialDatatype(): boolean {
    if (this.isRadioField()) return true;
    const specialTypes = [
      'boolean', 
      'date', 
      'datetime', 
      'time', 
      'number', 
      'integer',
      'url',
      'uri',
      'duration',
      'json',
      'object'
    ];
    return specialTypes.includes(this.field.datatype || '');
  }
  
  /**
   * A multi-valued field of a scalar special datatype (person.json schema:url,
   * datetime lists in v1.8.0): one input could neither show nor keep a list.
   */
  private isMultiValuedScalar(): boolean {
    return !!this.field.multiple && MULTI_VALUE_SCALARS.includes(this.field.datatype || '');
  }

  /**
   * Returns display label for a chip value.
   * If the value is a URI and vocabulary is available, returns the vocabulary label.
   */
  getChipDisplayValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    
    // Handle objects
    if (typeof value === 'object') {
      return this.formatSingleValue(value);
    }
    
    const stringValue = String(value);
    
    // Check if we have vocabulary and can find a matching concept
    if (this.field.vocabulary?.concepts) {
      const concept = this.field.vocabulary.concepts.find((c: any) => {
        // Match by URI
        if (c.uri === stringValue) return true;
        // Match by value (some schemas use value instead of uri)
        if (c.value === stringValue) return true;
        // Match by label (already translated)
        const label = typeof c.label === 'string' ? c.label : (c.label?.['de'] || c.label?.['en'] || '');
        if (label === stringValue) return true;
        return false;
      });
      if (concept) {
        if (typeof concept.label === 'string') return concept.label;
        return concept.label?.['de'] || concept.label?.['en'] || stringValue;
      }
    }
    
    return stringValue;
  }
}
