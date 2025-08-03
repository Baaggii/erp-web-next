if (typeof window !== 'undefined') {
  // Disable verbose debug logging by default to avoid console noise in
  // production environments. The flag can still be enabled later via
  // configuration (`useGeneralConfig`) when needed.
  window.erpDebug = Boolean(window.erpDebug);
  window.__stateCount = {};
}

export function debugLog(...args) {
  if (typeof window !== 'undefined' && window.erpDebug) {
    console.log(...args);
  }
}

export function trackSetState(name) {
  if (typeof window === 'undefined') return;
  const counts = (window.__stateCount ||= {});
  if (++counts[name] > 10) {
    console.error('Excessive setState:', name);
  }
}
