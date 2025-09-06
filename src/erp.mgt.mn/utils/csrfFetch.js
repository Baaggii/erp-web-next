import { API_BASE } from './apiBase.js';

let tokenPromise;
const controllers = new Set();

function abortAll() {
  controllers.forEach(controller => controller.abort());
  controllers.clear();
}

window.addEventListener('beforeunload', event => {
  if (controllers.size) {
    event.preventDefault();
    event.returnValue = '';
  }
});

window.addEventListener('unload', abortAll);
window.addEventListener('pagehide', abortAll);

function dispatchStart(key) {
  window.dispatchEvent(new CustomEvent('loading:start', { detail: { key } }));
}

function dispatchEnd(key) {
  window.dispatchEvent(new CustomEvent('loading:end', { detail: { key } }));
}

function currentKey() {
  return window.__activeTabKey || 'global';
}

async function getToken() {
  if (!tokenPromise) {
    tokenPromise = fetch(`${API_BASE}/csrf-token`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => data.csrfToken)
      .catch(() => undefined);
  }
  return tokenPromise;
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (url, options = {}, _retry) => {
  const { skipLoader, skipErrorToast, ...opts } = options || {};
  const controller = new AbortController();
  controllers.add(controller);
  if (opts.signal) {
    const userSignal = opts.signal;
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  opts.signal = controller.signal;
  const key = skipLoader ? null : currentKey();
  if (key) dispatchStart(key);
  const method = (opts.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const token = await getToken();
    opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': token };
    opts.credentials = opts.credentials || 'include';
  }
  let res;
  try {
    res = await originalFetch(url, opts);
  } finally {
    controllers.delete(controller);
    if (key) dispatchEnd(key);
  }
  if (res.status === 401 && !_retry) {
    let msg;
    try {
      const data = await res.clone().json();
      msg = data.message;
    } catch {}
    if (msg && msg.toLowerCase().includes('expired')) {
      const refreshRes = await originalFetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': await getToken() },
      });
      if (refreshRes.ok) {
        return window.fetch(url, { ...opts, skipLoader }, true);
      }
    }
    if (!url.toString().includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:logout'));
      if (!window.location.hash.startsWith('#/login')) {
        window.location.hash = '#/login';
      }
    }
    return res;
  }
  if (!res.ok && !skipErrorToast) {
    let errorMsg = res.statusText;
    try {
      const data = await res.clone().json();
      if (data && data.message) errorMsg = data.message;
    } catch {
      try {
        const text = await res.clone().text();
        errorMsg = text.slice(0, 200);
      } catch {}
    }
    if (import.meta.env.DEV) {
      console.error('API Error:', method, url, errorMsg);
    }
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { message: `❌ Request failed: ${errorMsg}`, type: 'error' } })
    );
  }
  return res;
};
