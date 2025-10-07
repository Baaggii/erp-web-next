import { API_BASE } from './apiBase.js';

const originalFetch = window.fetch.bind(window);

let tokenPromise;
let cachedToken;
let lastTokenErrorMessage;
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

window.addEventListener('auth:logout', () => {
  cachedToken = undefined;
  tokenPromise = undefined;
  lastTokenErrorMessage = undefined;
});

function dispatchStart(key) {
  window.dispatchEvent(new CustomEvent('loading:start', { detail: { key } }));
}

function dispatchEnd(key) {
  window.dispatchEvent(new CustomEvent('loading:end', { detail: { key } }));
}

function currentKey() {
  return window.__activeTabKey || 'global';
}

function looksLikeHtml(text) {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function formatSnippet(text) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function describeTokenFailure(status, statusText, bodyText) {
  const trimmed = (bodyText || '').trim();

  if (trimmed) {
    if (looksLikeHtml(trimmed)) {
      return `Unable to reach the ERP API at ${API_BASE}. The server returned HTML instead of JSON.`;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.message) {
        return `Unable to reach the ERP API at ${API_BASE}: ${parsed.message}`;
      }
    } catch {
      const snippet = formatSnippet(trimmed);
      if (snippet) {
        return `Unable to reach the ERP API at ${API_BASE}: ${snippet}${trimmed.length > 120 ? '…' : ''}`;
      }
    }
  }

  const statusPart = status
    ? `status ${status}${statusText ? ` ${statusText}` : ''}`
    : 'an unexpected status';
  return `Unable to reach the ERP API at ${API_BASE} (${statusPart}).`;
}

function describeUnexpectedTokenBody(bodyText) {
  const trimmed = (bodyText || '').trim();

  if (!trimmed) {
    return `The ERP API at ${API_BASE} returned an empty CSRF token response.`;
  }

  if (looksLikeHtml(trimmed)) {
    return `Unexpected HTML response from ${API_BASE}/csrf-token. Verify that the backend is running and the API base URL is correct.`;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.message) {
      return `The ERP API at ${API_BASE} did not return a CSRF token: ${parsed.message}`;
    }
  } catch {
    const snippet = formatSnippet(trimmed);
    if (snippet) {
      return `Unexpected response from ${API_BASE}/csrf-token: ${snippet}${trimmed.length > 120 ? '…' : ''}`;
    }
  }

  return `Unexpected response from ${API_BASE}/csrf-token.`;
}

async function fetchCsrfToken() {
  let res;
  try {
    res = await originalFetch(`${API_BASE}/csrf-token`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    const message = err?.message ? ` ${err.message}` : '';
    throw new Error(`Unable to reach the ERP API at ${API_BASE}/csrf-token.${message}`);
  }

  const clone = res.clone();
  let bodyText = '';
  try {
    bodyText = await clone.text();
  } catch {
    bodyText = '';
  }

  if (!res.ok) {
    throw new Error(describeTokenFailure(res.status, res.statusText, bodyText));
  }

  let data;
  if (bodyText) {
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error(describeUnexpectedTokenBody(bodyText));
    }
  } else {
    try {
      data = await res.json();
    } catch {
      throw new Error(`The ERP API at ${API_BASE} returned an empty CSRF token response.`);
    }
  }

  const token = data?.csrfToken;
  if (typeof token !== 'string' || !token) {
    throw new Error('The ERP API response did not include a CSRF token.');
  }

  return token;
}

async function ensureToken() {
  if (cachedToken) return cachedToken;
  if (!tokenPromise) {
    tokenPromise = fetchCsrfToken()
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        tokenPromise = undefined;
      });
  }
  return tokenPromise;
}

async function getToken({ suppressToast = false } = {}) {
  try {
    const token = await ensureToken();
    lastTokenErrorMessage = undefined;
    return token;
  } catch (err) {
    const message = err?.message || 'Unable to fetch CSRF token.';
    if (!suppressToast && message !== lastTokenErrorMessage) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message, type: 'error' },
        })
      );
      lastTokenErrorMessage = message;
    }
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
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const token = await getToken({ suppressToast: skipErrorToast });
    if (typeof Headers !== 'undefined') {
      const headers = new Headers(opts.headers || {});
      headers.set('X-CSRF-Token', token);
      opts.headers = headers;
    } else {
      opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': token };
    }
    opts.credentials = opts.credentials || 'include';
  }
  let res;
  try {
    res = await originalFetch(url, opts);
  } finally {
    controllers.delete(controller);
    if (key) dispatchEnd(key);
  }
  if (res.status === 403) {
    try {
      const text = await res.clone().text();
      if (text?.toLowerCase().includes('csrf')) {
        cachedToken = undefined;
      }
    } catch {}
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
        headers: { 'X-CSRF-Token': await getToken({ suppressToast: true }) },
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
      new CustomEvent('toast', {
        detail: { message: `Request failed: ${errorMsg}`, type: 'error' },
      })
    );
  }
  return res;
};
