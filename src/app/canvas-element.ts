/**
 * The custom element class of the widget: Angular Elements' element for
 * CanvasComponent, with what it lacks for a host page (audit 14.11., U-08, W-38).
 *
 * Angular destroys the component 10 ms after the element left the document.
 * When the element comes back, a new component has none of the inputs the
 * host had set: they were handed to the one that is gone. (Measured with
 * Angular 21.2: on the first return no component is built at all, see
 * connectedCallback.) A host that takes the element out and puts it back
 * later (a tab, a dialog) got a dead or an unconfigured widget. The element
 * now remembers what the host set and hands it over again.
 *
 * Kept in the element and not in a strategy of our own: the strategy Angular
 * uses is not exported, and replacing it means copying its change detection.
 */
import { Injector, reflectComponentType } from '@angular/core';
import { NgElementStrategy, createCustomElement } from '@angular/elements';

import { CanvasComponent } from './components/canvas/canvas.component';

/**
 * Inputs that start something each time they are set (an extraction, a
 * reset) and configure nothing: they fire for the same value again, and they
 * are not repeated when the element comes back.
 */
const TRIGGERS = new Set(['autoExtract', 'forceReset']);

/** What the subclass uses of Angular's element (declared abstract and protected there). */
interface AngularElement extends HTMLElement {
  ngElementStrategy: NgElementStrategy;
  connectedCallback(): void;
}

type SetInput = (name: string, value: any, transform?: (value: any) => any) => void;

export function createCanvasElement(injector: Injector): CustomElementConstructor {
  const Base = createCustomElement(CanvasComponent, { injector }) as unknown as
    new (injector?: Injector) => AngularElement;
  const inputs = (reflectComponentType(CanvasComponent)?.inputs ?? []).map(input => input.propName);

  return class CanvasElement extends Base {
    /** What the host set last, by input, in the order of the last setting. */
    private hostInputs = new Map<string, unknown>();
    /** Hands a value to the component (or keeps it for the one to come), as Angular does. */
    private apply: SetInput;
    private connectedBefore = false;

    static {
      // The properties answer with what the host set (U-08 c): most inputs are
      // setters without a getter, so reading one back gave undefined.
      for (const name of inputs) {
        const inherited = Object.getOwnPropertyDescriptor(Base.prototype, name);
        Object.defineProperty(this.prototype, name, {
          get(this: CanvasElement) {
            return this.hostInputs.get(name);
          },
          set(this: CanvasElement, value: unknown) {
            inherited?.set?.call(this, value);
          },
          configurable: true,
          enumerable: true,
        });
      }
    }

    constructor(elementInjector?: Injector) {
      super(elementInjector);
      // Properties set before the element was upgraded: Angular takes them
      // over when the strategy is created, which the next statement does.
      for (const name of inputs) {
        if (Object.prototype.hasOwnProperty.call(this, name)) {
          this.hostInputs.set(name, (this as unknown as Record<string, unknown>)[name]);
        }
      }
      const strategy = this.ngElementStrategy;
      this.apply = strategy.setInputValue.bind(strategy);
      // Every way in - property, attribute, Angular's own replay of the first
      // inputs - ends in this method.
      strategy.setInputValue = (name, value, transform) => {
        this.hostInputs.delete(name);
        this.hostInputs.set(name, value);
        // Angular drops a value equal to the one before. For a trigger the
        // repetition is the message (`autoExtract = true` once per page):
        // forget the value before, so the same one is new again (U-08 b).
        if (TRIGGERS.has(name)) this.apply(name, undefined, transform);
        this.apply(name, value, transform);
      };
    }

    override connectedCallback(): void {
      if (!this.connectedBefore) {
        this.connectedBefore = true;
        super.connectedCallback();
        return;
      }
      // Back in the document. If the component survived (moved within 10 ms),
      // it has these values and Angular drops them as unchanged; a new one
      // starts with them like the first did (U-08 a).
      for (const [name, value] of this.hostInputs) {
        if (!TRIGGERS.has(name)) this.apply(name, value);
      }
      super.connectedCallback();
      // Angular (21.2) builds no new component on the first return after it
      // destroyed the old one: its connect() only clears the timer of the
      // destruction that has already happened. The element then showed the
      // dead component's last DOM and answered to nothing. A second connect
      // builds the component; with a living one it does nothing.
      this.ngElementStrategy.connect(this);
    }
  };
}
