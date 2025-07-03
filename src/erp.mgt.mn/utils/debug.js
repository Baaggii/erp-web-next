if (typeof window !== 'undefined') {
  window.erpDebug = true;
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
