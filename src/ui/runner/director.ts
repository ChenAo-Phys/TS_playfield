/**
 * The Director (ui-spec §9.1, §15.1): components register a handler per beat kind; the runner runs
 * every handler of a beat's kind in parallel. A kind with no handler resolves at once.
 *
 * Safety nets, so a faulty handler can never stall the game: a handler that throws or rejects is
 * logged and counts as done; after Skip (`ctx.signal` aborted) a handler that has not resolved
 * within `ABORT_GRACE_MS` is no longer waited for.
 */
import type { Beat, BeatContext, BeatHandler, BeatKind, Director } from "../ui-contract";

export const ABORT_GRACE_MS = 150;

/** What a director observer sees (the demo's beat log, tests). */
export interface BeatRecord {
  beat: Beat;
  /** Handlers registered for its kind when it ran. */
  handlers: number;
  phase: "start" | "end";
  aborted: boolean;
}

export interface RunnerDirector extends Director {
  /** Number of handlers registered for `kind`. */
  count(kind: BeatKind): number;
  /** Observe every beat run (start and end); returns the unsubscribe function. */
  observe(fn: (r: BeatRecord) => void): () => void;
}

function afterAbort(signal: AbortSignal, ms: number): Promise<void> {
  return new Promise(resolve => {
    const fire = () => setTimeout(resolve, ms);
    if (signal.aborted) fire();
    else signal.addEventListener("abort", fire, { once: true });
  });
}

export function createDirector(): RunnerDirector {
  const handlers = new Map<BeatKind, Set<BeatHandler>>();
  const observers = new Set<(r: BeatRecord) => void>();
  const notify = (r: BeatRecord) => {
    for (const o of [...observers]) {
      try { o(r); } catch (e) { console.error(e); }
    }
  };
  return {
    on<K extends BeatKind>(kind: K, handler: BeatHandler<K>): () => void {
      let set = handlers.get(kind);
      if (!set) handlers.set(kind, (set = new Set()));
      const h = handler as unknown as BeatHandler;
      set.add(h);
      return () => { set!.delete(h); };
    },
    async run(beat: Beat, ctx: BeatContext): Promise<void> {
      const list = [...(handlers.get(beat.k) ?? [])];
      notify({ beat, handlers: list.length, phase: "start", aborted: ctx.signal.aborted });
      if (list.length) {
        const grace = afterAbort(ctx.signal, ABORT_GRACE_MS);
        await Promise.all(list.map(h => {
          let p: Promise<void>;
          try {
            p = Promise.resolve(h(beat as never, ctx));
          } catch (e) {
            p = Promise.reject(e);
          }
          return Promise.race([p.catch(e => { console.error(`beat handler for "${beat.k}" failed`, e); }), grace]);
        }));
      }
      notify({ beat, handlers: list.length, phase: "end", aborted: ctx.signal.aborted });
    },
    count: kind => handlers.get(kind)?.size ?? 0,
    observe(fn) {
      observers.add(fn);
      return () => { observers.delete(fn); };
    },
  };
}
