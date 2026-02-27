// Prefer an explicit VITE_API_BASE (e.g. https://backend.example.com/api)
// and fall back to a relative "/api" path so the frontend can run behind
// the same origin as the backend without extra configuration.
const rawBase = import.meta?.env?.VITE_API_BASE || '/api';
export const API_BASE = rawBase.replace(/\/$/, '');

// Helper to strip the trailing "/api" segment for building non-API URLs
export const API_ROOT = API_BASE.replace(/\/api\/?$/, '');

export function buildApiEndpointCandidates(path) {
  const normalizedPath = String(path || '').startsWith('/') ? path : `/${path}`;
  const primary = `${API_BASE}${normalizedPath}`;
  if (API_BASE === '/api') return [primary, normalizedPath];
  return [primary];
}

export async function fetchWithApiFallback(fetchImpl, path, options = {}) {
  const candidates = buildApiEndpointCandidates(path);
  let lastResponse = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const response = await fetchImpl(candidates[i], options);
    lastResponse = response;
    if (response.status !== 404 || i === candidates.length - 1) return response;
  }
  return lastResponse;
}
