export const INITIAL_STATE = {
  period: null,
  focusTheme: null,
  compareTheme: null,
  element: null,
};

export function createStore(initial = INITIAL_STATE) {
  let state = { ...initial };
  const listeners = new Set();
  let pending = null;

  function flush() {
    const { changed, source } = pending;
    pending = null;
    for (const fn of listeners) fn(state, changed, source);
  }

  return {
    get: () => state,

    set(patch, source = "unknown") {
      const changed = Object.keys(patch).filter(k => !sameValue(state[k], patch[k]));
      // clear all must reach the views even when no key changed (zoom levels are local)
      if (!changed.length && source !== "clearAll") return;
      state = { ...state, ...patch };
      if (!pending) {
        pending = { changed: new Set(), source };
        requestAnimationFrame(flush);
      }
      changed.forEach(k => pending.changed.add(k));
      if (source === "clearAll") {
        pending.source = "clearAll";
        pending.changed.add("clearAll");
      }
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return a === b;
}
