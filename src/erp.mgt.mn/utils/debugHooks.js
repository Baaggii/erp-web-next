import * as React from 'react';
import { debugLog } from './debug.js';

export function setupDebugHooks() {
  if (typeof window === 'undefined' || !window.erpDebug) return;
  if (React.__erpDebugPatched) return;
  React.__erpDebugPatched = true;

  function patchEffect(name) {
    const orig = React[name];
    React[name] = (cb, deps) => {
      if (deps === undefined) {
        console.warn(`${name} without dependency array`);
      }
      return orig(() => {
        debugLog(`${name} run`, deps);
        return cb();
      }, deps);
    };
  }

  ['useEffect', 'useLayoutEffect'].forEach(patchEffect);

  function patchMemo(name) {
    const orig = React[name];
    React[name] = (cb, deps) => {
      if (deps === undefined) {
        console.warn(`${name} without dependency array`);
      }
      debugLog(`${name} evaluate`, deps);
      return orig(cb, deps);
    };
  }

  ['useMemo', 'useCallback'].forEach(patchMemo);
}
