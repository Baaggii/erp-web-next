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
window.fetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const token = await getToken();
    options.headers = { ...(options.headers || {}), 'X-CSRF-Token': token };
    options.credentials = options.credentials || 'include';
  }
  return originalFetch(url, options);
};
