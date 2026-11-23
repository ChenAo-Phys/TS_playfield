/**
 * One set of beat handlers shared by every component that asks for it (the console and a status panel
 * may both be mounted; so may the rail and its tablet flyouts): the first caller registers, later callers
 * only join, and the handlers stay until the last one leaves. Handlers read the newest caller's deps.
 */
interface Registration {
  stack: unknown[];
  off: (() => void) | null;
}

const regs = new WeakMap<object, Registration>();

export function shareRegistration<D>(key: object, deps: D, register: (current: () => D) => () => void): () => void {
  let reg = regs.get(key);
  if (!reg) {
    reg = { stack: [], off: null };
    regs.set(key, reg);
  }
  const r = reg;
  r.stack.push(deps);
  if (r.stack.length === 1) r.off = register(() => r.stack[r.stack.length - 1] as D);
  let left = false;
  return () => {
    if (left) return;
    left = true;
    const i = r.stack.lastIndexOf(deps);
    if (i >= 0) r.stack.splice(i, 1);
    if (!r.stack.length) {
      r.off?.();
      r.off = null;
    }
  };
}

/** How many callers share `key` now (tests). */
export function sharers(key: object): number {
  return regs.get(key)?.stack.length ?? 0;
}
