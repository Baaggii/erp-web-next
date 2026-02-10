export function dispatchStart(key) {
  window.dispatchEvent(new CustomEvent('loading:start', { detail: { key } }));
}

export function dispatchEnd(key) {
  window.dispatchEvent(new CustomEvent('loading:end', { detail: { key } }));
}

export function currentLoaderKey() {
  return window.__activeTabKey || 'global';
}
