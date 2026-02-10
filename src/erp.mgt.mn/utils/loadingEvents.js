export function dispatchStart(key) {
  window.dispatchEvent(new CustomEvent('loading:start', { detail: { key } }));
}

export function dispatchEnd(key) {
  window.dispatchEvent(new CustomEvent('loading:end', { detail: { key } }));
}

export function currentLoaderKey() {
  if (typeof window !== 'undefined') {
    const path = typeof window.location?.pathname === 'string'
      ? window.location.pathname.trim()
      : '';
    if (path) return path;
    if (window.__activeTabKey) return window.__activeTabKey;
  }
  return 'global';
}
