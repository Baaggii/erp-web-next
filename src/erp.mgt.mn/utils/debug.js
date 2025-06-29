if (typeof window !== 'undefined') {
  window.erpDebug = true;
}

export function debugLog(...args) {
  if (typeof window !== 'undefined' && window.erpDebug) {
    console.log(...args);
  }
}
