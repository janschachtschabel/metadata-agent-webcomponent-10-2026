/**
 * Audit 14.11. (U-05): the host page could not set the widget's language. The
 * only way was the language switch - which the embedding recommended for
 * edu-sharing hides -, the browser's language decided otherwise, and a
 * localStorage entry `app_language` of the host page was read as the widget's.
 *
 * At the level of the custom element, as a host page uses it.
 */
import { Injector, provideZoneChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { createCanvasElement } from './canvas-element';
import { I18nService } from './core/i18n.service';
import { DEFAULT_SCHEMAS, configureCanvasTestBed } from './testing/canvas-harness';

type CanvasElement = HTMLElement & Record<string, any>;

const STORED = 'metadata-agent-canvas.language';
const wait = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));

let defined = 0;

describe('<metadata-agent-canvas language>', () => {
  let tag: string;
  let host: HTMLElement;
  /** What the widget falls back to when nothing else decides. */
  let browser: string;
  let other: string;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZoneChangeDetection({ eventCoalescing: true })] });
    await configureCanvasTestBed(DEFAULT_SCHEMAS);
    // The harness chose German as an editor would; these specs start without a choice.
    localStorage.removeItem(STORED);
    localStorage.removeItem('app_language');
    tag = `metadata-agent-canvas-language-${++defined}`;
    customElements.define(tag, createCanvasElement(TestBed.inject(Injector)));
    host = document.createElement('div');
    document.body.appendChild(host);
    browser = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'de';
    other = browser === 'en' ? 'de' : 'en';
  });

  afterEach(async () => {
    host.remove();
    localStorage.removeItem(STORED);
    localStorage.removeItem('app_language');
    await wait(30); // Angular destroys the components 10 ms after they left
  });

  /** The element in a page of language `pageLang`, once it has started. */
  async function mount(attributes = '', pageLang?: string): Promise<CanvasElement> {
    if (pageLang) host.setAttribute('lang', pageLang);
    host.innerHTML = `<section><${tag} instance-id="${tag}" layout="clean" ${attributes}></${tag}></section>`;
    await wait();
    return host.querySelector(tag) as CanvasElement;
  }

  const spoken = () => TestBed.inject(I18nService).currentLang;

  it('speaks the language of its attribute, whatever was remembered', async () => {
    localStorage.setItem(STORED, 'de');

    const element = await mount('language="en"');

    expect(spoken()).toBe('en');
    expect(element.getAttribute('lang')).withContext('the element says what it speaks').toBe('en');
    expect(localStorage.getItem(STORED)).withContext('the editor\'s own choice is kept').toBe('de');
  });

  it('follows the property, and a regional tag by its language', async () => {
    localStorage.setItem(STORED, 'de');
    const element = await mount();
    expect(spoken()).toBe('de');

    element['language'] = 'en-GB';
    await wait();

    expect(spoken()).toBe('en');
    expect(element['language']).withContext('read back as set').toBe('en-GB');
  });

  it('goes back to the remembered choice when the attribute is removed', async () => {
    localStorage.setItem(STORED, 'de');
    const element = await mount('language="en"');

    element.removeAttribute('language');
    await wait();

    expect(spoken()).toBe('de');
  });

  it('treats a language it does not speak as not set', async () => {
    localStorage.setItem(STORED, 'en');

    await mount('language="fr"');

    expect(spoken()).toBe('en');
  });

  it('takes the language of the page around it before the browser\'s', async () => {
    await mount('', `${other}-AT`);

    expect(spoken()).withContext(`page: ${other}, browser: ${browser}`).toBe(other);
    expect(localStorage.getItem(STORED)).withContext('nobody chose: nothing is remembered').toBeNull();
  });

  it('prefers the remembered choice to the language of the page', async () => {
    localStorage.setItem(STORED, browser);

    await mount('', other);

    expect(spoken()).toBe(browser);
  });

  it('falls back to the browser\'s language', async () => {
    await mount();

    expect(spoken()).toBe(browser);
  });

  it('does not read the host page\'s `app_language`', async () => {
    localStorage.setItem('app_language', other);

    await mount();

    expect(spoken()).toBe(browser);
    expect(localStorage.getItem('app_language')).withContext('the host\'s entry is left alone').toBe(other);
  });

  it('remembers the editor\'s switch, which then counts until the host sets a language again', async () => {
    const element = await mount('language="en"');

    (element.querySelector('app-language-switcher button') as HTMLButtonElement).click();
    await wait();

    expect(spoken()).toBe('de');
    expect(localStorage.getItem(STORED)).toBe('de');
  });
});
