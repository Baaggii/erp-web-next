import * as React from 'react';
import { debugLog } from './debug.js';

export function setupDebugHooks() {
  if (typeof window === 'undefined' || !window.erpDebug) return;
  if (window.__erpDebugPatched) return;
  window.__erpDebugPatched = true;
  if (!Object.isExtensible(React)) {
    console.warn('React is sealed; skipping debug hooks');
    return;
  }

  function replaceHook(name, wrapper) {
    const desc = Object.getOwnPropertyDescriptor(React, name);
    if (!desc || typeof desc.value !== 'function') return;
    try {
      Object.defineProperty(React, name, {
        configurable: true,
        enumerable: desc.enumerable,
        value: wrapper(desc.value),
      });
    } catch (err) {
      console.warn('Unable to patch', name, err);
    }
  }

  ['useEffect', 'useLayoutEffect'].forEach((name) =>
    replaceHook(name, (orig) => (cb, deps) => {
      if (deps === undefined) {
        console.warn(`${name} without dependency array`);
      }
      return orig(() => {
        debugLog(`${name} run`, deps);
        return cb();
      }, deps);
    }),
  );

  ['useMemo', 'useCallback'].forEach((name) =>
    replaceHook(name, (orig) => (cb, deps) => {
      if (deps === undefined) {
        console.warn(`${name} without dependency array`);
      }
      debugLog(`${name} evaluate`, deps);
      return orig(cb, deps);
    }),
  );
}
