import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { Notice, WidgetNoticeComponent } from './widget-notice.component';
import { seriousA11yViolations } from '../../../testing/a11y';

/**
 * Messages and questions inside the widget instead of alert()/confirm() (audit U-05).
 * Browser dialogs block the whole host page, cannot be styled or translated
 * by the widget, and some embedding contexts (sandboxed iframes) suppress
 * them silently - a reset then never happens and an upload error is never seen.
 */
describe('WidgetNoticeComponent', () => {
  let fixture: ComponentFixture<WidgetNoticeComponent>;
  let closed: boolean[];

  async function show(notice: Notice): Promise<HTMLElement> {
    fixture.componentRef.setInput('notice', notice);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
    return fixture.nativeElement.querySelector('.widget-notice');
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetNoticeComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(WidgetNoticeComponent);
    closed = [];
    fixture.componentInstance.closed.subscribe((confirmed: boolean) => closed.push(confirmed));
  });

  it('shows nothing without a notice, but its live regions are already there', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.widget-notice')).toBeNull();
    // A live region inserted together with its text is often not announced
    // (NVDA + Chrome): the regions exist first, only their text changes.
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('announces information politely and an error at once', async () => {
    await show({ text: 'Gespeichert', kind: 'info' });
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe('Gespeichert');

    await show({ text: 'Fehlgeschlagen', kind: 'error' });
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent.trim()).toBe('Fehlgeschlagen');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent.trim()).toBe('');
  });

  it('announces the same message again when it comes again', async () => {
    const region = () => fixture.nativeElement.querySelector('[role="status"]') as HTMLElement;
    await show({ text: 'Bitte geben Sie einen Text ein.', kind: 'info' });

    // A live region only speaks when its content changes: the second, equal
    // message must empty it first and then fill it again.
    const changes: string[] = [];
    const observer = new MutationObserver(() => changes.push(region().textContent!.trim()));
    observer.observe(region(), { childList: true, characterData: true, subtree: true });
    await show({ text: 'Bitte geben Sie einen Text ein.', kind: 'info' });
    observer.disconnect();

    expect(changes).toContain('');
    expect(region().textContent!.trim()).toBe('Bitte geben Sie einen Text ein.');
  });

  it('starts on Cancel when the confirmation cannot be undone', async () => {
    const box = await show({ text: 'Alles zurücksetzen?', kind: 'info', question: true, destructive: true });

    expect(document.activeElement).toBe(box.querySelector('.cancel-button'));
  });

  it('keeps Escape to itself, so a host dialog around the widget stays open', async () => {
    const box = await show({ text: 'Frage?', kind: 'info', question: true });
    const outside = jasmine.createSpy('outside');
    fixture.nativeElement.addEventListener('keydown', outside);

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(outside).not.toHaveBeenCalled();
  });

  it('gives the focus back to where it was when the notice closes', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    try {
      const box = await show({ text: 'Frage?', kind: 'info', question: true });
      (box.querySelector('.cancel-button') as HTMLElement).click();
      fixture.componentRef.setInput('notice', null);
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve));

      expect(document.activeElement).toBe(trigger);
    } finally {
      trigger.remove();
    }
  });

  it('asks as an alertdialog with the focus on the confirm button', async () => {
    const box = await show({ text: 'Wirklich zurücksetzen?', kind: 'info', question: true });

    expect(box.getAttribute('role')).toBe('alertdialog');
    expect(document.getElementById(box.getAttribute('aria-describedby')!)!.textContent)
      .toContain('Wirklich zurücksetzen?');
    expect(document.activeElement).toBe(box.querySelector('.confirm-button'));
  });

  it('reports the answer: confirm, cancel or Escape', async () => {
    let box = await show({ text: 'Trotzdem hochladen?', kind: 'info', question: true });
    (box.querySelector('.confirm-button') as HTMLElement).click();
    box = await show({ text: 'Trotzdem hochladen?', kind: 'info', question: true });
    (box.querySelector('.cancel-button') as HTMLElement).click();
    box = await show({ text: 'Trotzdem hochladen?', kind: 'info', question: true });
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(closed).toEqual([true, false, false]);
  });

  it('draws the information icon without an icon font', async () => {
    // edu-sharing's icon font (Material Symbols) has no ligature "info_outline".
    const box = await show({ text: 'Gespeichert', kind: 'info' });
    const icon = box.querySelector('mat-icon') as HTMLElement;
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.textContent?.trim()).toBe('');

    const error = await show({ text: 'Fehlgeschlagen', kind: 'error' });
    expect(error.querySelector('mat-icon')?.textContent?.trim()).toBe('error_outline');
  });

  it('can be dismissed', async () => {
    const box = await show({ text: 'Upload erfolgreich', kind: 'info' });
    (box.querySelector('.dismiss-button') as HTMLElement).click();

    expect(closed).toEqual([false]);
  });

  it('keeps line breaks of the message', async () => {
    const box = await show({ text: 'Diese URL existiert bereits.\n\nTrotzdem hochladen?', kind: 'info' });

    expect(getComputedStyle(box.querySelector('.notice-text')!).whiteSpace).toBe('pre-line');
  });

  it('has no serious accessibility violations', async () => {
    expect(await seriousA11yViolations(await show({ text: 'Frage?', kind: 'info', question: true }))).toEqual([]);
    expect(await seriousA11yViolations(await show({ text: 'Fehler', kind: 'error' }))).toEqual([]);
  });
});
