import { BehaviorSubject } from 'rxjs';
import { CanvasFieldState, CanvasState, createInitialState } from '../shared/models/canvas.models';

/**
 * Shared state container for a single instance.
 * Multiple CanvasComponent elements with the same instance ID
 * share one SharedInstanceState so their data stays in sync.
 */
export interface SharedInstanceState {
  stateSubject: BehaviorSubject<CanvasState>;
  fieldValueCache: Map<string, CachedValues>;
  /** IDs of CanvasComponents currently bound to this instance */
  components: Set<string>;
  /** The component that emits DOM events (metadataChange, etc.) */
  primaryId: string | null;
  /**
   * Number of the newest run on this state (see CanvasService). Shared like
   * the state: a reset or an import in one element supersedes a run that
   * another element of the same instance started.
   */
  generation: number;
  /** Fields the editor changed during the current run, as edited, by top-level field id (L-01). */
  editsDuringRun: Map<string, CanvasFieldState>;
  /** What the current run extracts from; a type choice re-runs it for the new type. */
  runInput: RunInput | null;
  /**
   * Runs a type choice cut short, by run number, with the run it put in their
   * place (null if none was started). The caller of the replaced run learns
   * from it whether its source made it into the form after all.
   */
  takeovers: Map<number, Promise<RunOutcome | null>>;
  /**
   * The type choice that cut a run short and is still loading its schema
   * (its run number). A choice made meanwhile takes the interruption over.
   */
  pendingTakeover: number | null;
  /**
   * The values of an import without a metadataset of its own, for the special
   * fields of a type chosen afterwards (2.1.1 kept them in the metadata map):
   * `el.metadataInput = {...}; el.contentType = 'event.json'` (F2).
   */
  importedValues: CachedValues | null;
  /**
   * Ids of all fields of each schema the form was built from, by schema file -
   * also those without a form field (ask_user false). The export keeps exactly
   * these keys (W-L1); the schema cache all widgets share is emptied by a
   * widget that sets another context.
   */
  schemaFieldIds: Map<string, Set<string>>;
  /**
   * Keys of the imported record the form has no field for: unknown ones, and
   * the type values of an import without a type. The events and the JSON
   * export return them as 2.1.1 did; the upload does not (W-L1).
   */
  importedKeys: Set<string>;
}

/** Field values by field id with whether each came from the AI. */
export interface CachedValues {
  values: Record<string, any>;
  origins: Record<string, boolean>;
}

/** How a run ended: `succeeded` once its result is in the form. */
export interface RunOutcome {
  run: number;
  succeeded: boolean;
}

/** The source of an extraction: typed text, a URL or an edu-sharing node. */
export interface RunInput {
  mode: 'text' | 'url' | 'node';
  value: string;
}

/**
 * Static registry that manages per-instance shared state.
 *
 * - Different instance IDs → fully isolated state & events.
 * - Same instance ID     → shared state, only the *primary*
 *   component emits events (no duplicates).
 */
export class InstanceRegistry {
  private static instances = new Map<string, SharedInstanceState>();

  /** Get or lazily create the shared state for an instance. */
  static getOrCreate(instanceId: string): SharedInstanceState {
    if (!this.instances.has(instanceId)) {
      this.instances.set(instanceId, {
        stateSubject: new BehaviorSubject<CanvasState>(createInitialState()),
        fieldValueCache: new Map(),
        components: new Set(),
        primaryId: null,
        generation: 0,
        editsDuringRun: new Map(),
        runInput: null,
        takeovers: new Map(),
        pendingTakeover: null,
        importedValues: null,
        schemaFieldIds: new Map(),
        importedKeys: new Set(),
      });
    }
    return this.instances.get(instanceId)!;
  }

  /**
   * Register a component for an instance.
   * @returns `true` if this component became the primary (event-emitter).
   */
  static register(instanceId: string, componentId: string): boolean {
    const inst = this.getOrCreate(instanceId);
    inst.components.add(componentId);
    if (!inst.primaryId) {
      inst.primaryId = componentId;
      return true;
    }
    return inst.primaryId === componentId;
  }

  /** Whether the component currently emits its instance's events. */
  static isPrimary(instanceId: string, componentId: string): boolean {
    return this.instances.get(instanceId)?.primaryId === componentId;
  }

  /**
   * Unregister a component.  If it was primary, the next registered
   * component is automatically promoted.
   */
  static unregister(instanceId: string, componentId: string): void {
    const inst = this.instances.get(instanceId);
    if (!inst) return;
    inst.components.delete(componentId);
    if (inst.primaryId === componentId) {
      // Promote next component or clear
      const next = inst.components.values().next();
      inst.primaryId = next.done ? null : next.value;
    }
    // Clean up empty instances
    if (inst.components.size === 0) {
      this.instances.delete(instanceId);
    }
  }
}
