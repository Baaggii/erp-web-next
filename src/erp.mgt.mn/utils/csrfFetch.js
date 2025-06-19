let tokenPromise;

async function getToken() {
  if (!tokenPromise) {
    tokenPromise = fetch('/api/csrf-token', { credentials: 'include' })
      .then(res => res.json())
      .then(data => data.csrfToken)
      .catch(() => undefined);
  }
  return tokenPromise;
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (url, options = {}, _retry) => {
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const token = await getToken();
    options.headers = { ...(options.headers || {}), 'X-CSRF-Token': token };
    options.credentials = options.credentials || 'include';
  }
  const res = await originalFetch(url, options);
  if (res.status === 401 && !_retry) {
    let msg;
    try {
      const data = await res.clone().json();
      msg = data.message;
    } catch {}
    if (msg && msg.toLowerCase().includes('expired')) {
      const refreshRes = await originalFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': await getToken() },
      });
      if (refreshRes.ok) {
        return window.fetch(url, options, true);
      }
    }
  }
  if (!res.ok) {
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
