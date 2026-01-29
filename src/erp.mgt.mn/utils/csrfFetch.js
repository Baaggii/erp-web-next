import { API_BASE } from './apiBase.js';
import { currentLoaderKey, dispatchEnd, dispatchStart } from './loadingEvents.js';

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


async function getToken() {
  if (!tokenPromise) {
    tokenPromise = fetch(`${API_BASE}/csrf-token`, { credentials: 'include' })
      .then(async res => {
        if (!res.ok) {
          throw new Error(res.statusText || 'Failed to fetch token');
        }
        const data = await res.json();
        const token = data?.csrfToken;
        if (!token) {
          throw new Error('Missing CSRF token in response');
        }
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { message: 'CSRF token retrieved successfully.', type: 'success' },
          })
        );
        return token;
      })
      .catch(err => {
        tokenPromise = undefined;
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: `CSRF token request failed: ${err?.message || 'Unknown error'}`,
              type: 'error',
            },
          })
        );
        return undefined;
      });
  }
  return tokenPromise;
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (url, options = {}, _retry) => {
  const controller = new AbortController();
  controllers.add(controller);
  let key = null;
  let opts = {};
  let skipErrorToast = false;

  try {
    const parsed = options || {};
    const { skipLoader, skipErrorToast: toastFlag, ...rest } = parsed;
    skipErrorToast = Boolean(toastFlag);
    opts = rest || {};

    if (opts.signal) {
      const userSignal = opts.signal;
      if (userSignal.aborted) controller.abort();
      else userSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    opts.signal = controller.signal;

    key = skipLoader ? null : currentLoaderKey();
    if (key) dispatchStart(key);

    const method = (opts.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const token = await getToken();
      opts.headers = { ...(opts.headers || {}), 'X-CSRF-Token': token };
      opts.credentials = opts.credentials || 'include';
    }

    const res = await originalFetch(url, opts);

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
        new CustomEvent('toast', {
          detail: { message: `Request failed: ${errorMsg}`, type: 'error' },
        })
      );
    }

    return res;
  } finally {
    controllers.delete(controller);
    if (key) dispatchEnd(key);
  }
};
