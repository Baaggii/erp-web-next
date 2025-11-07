import { API_BASE } from './apiBase.js';

const isDevEnv = Boolean(typeof import.meta !== 'undefined' && import.meta?.env?.DEV);

const originalFetch = window.fetch.bind(window);
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

async function requestCsrfToken() {
  const res = await originalFetch(`${API_BASE}/csrf-token`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const err = new Error(`Failed to fetch CSRF token (status ${res.status})`);
    err.status = res.status;
    err.code = 'CSRF_TOKEN_UNAVAILABLE';
    throw err;
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    const parseError = err instanceof Error ? err : new Error('Invalid CSRF token response');
    parseError.code = 'CSRF_TOKEN_UNAVAILABLE';
    throw parseError;
  }
  if (!data || typeof data.csrfToken !== 'string' || !data.csrfToken) {
    const err = new Error('Invalid CSRF token response');
    err.code = 'CSRF_TOKEN_UNAVAILABLE';
    throw err;
  }
  return data.csrfToken;
}

async function getToken() {
  if (!tokenPromise) {
    tokenPromise = requestCsrfToken();
  }
  try {
    return await tokenPromise;
  } catch (err) {
    tokenPromise = undefined;
    throw err;
  }
}

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
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    controllers.delete(controller);
    if (key) dispatchEnd(key);
  };

  try {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      let token;
      try {
        token = await getToken();
      } catch (err) {
        const error = err instanceof Error ? err : new Error('CSRF token unavailable');
        if (!error.code) error.code = 'CSRF_TOKEN_UNAVAILABLE';
        cleanup();
        throw error;
      }
      if (!token) {
        const error = new Error('CSRF token unavailable');
        error.code = 'CSRF_TOKEN_UNAVAILABLE';
        cleanup();
        throw error;
      }
      opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': token };
      opts.credentials = opts.credentials || 'include';
    }
    const res = await originalFetch(url, opts);
    cleanup();
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
      const contentType = (res.headers && typeof res.headers.get === 'function')
        ? res.headers.get('content-type') || ''
        : '';
      let errorMsg = res.statusText;
      let fallbackText;
      try {
        const data = await res.clone().json();
        if (data && data.message) errorMsg = data.message;
      } catch {
        try {
          fallbackText = await res.clone().text();
          if (fallbackText) {
            errorMsg = fallbackText.slice(0, 200);
          }
        } catch {}
      }
      const trimmedText = typeof fallbackText === 'string' ? fallbackText.trim() : '';
      const looksHtml = /text\/html/i.test(contentType)
        || /^<!doctype/i.test(trimmedText)
        || /^<html/i.test(trimmedText)
        || /^<!doctype/i.test((errorMsg || '').trim())
        || /^<html/i.test((errorMsg || '').trim());
      if (res.status === 503 || looksHtml) {
        errorMsg = 'Service unavailable';
      }
      if (isDevEnv) {
        console.error('API Error:', method, url, errorMsg);
      }
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: `Request failed: ${errorMsg}`, type: 'error' },
        })
      );
    }
    return res;
  } catch (err) {
    cleanup();
    throw err;
  }
};
