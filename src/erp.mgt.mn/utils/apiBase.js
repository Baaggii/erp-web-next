// Prefer an explicit VITE_API_BASE (e.g. https://backend.example.com/api)
// and fall back to a relative path so the frontend can run behind the same
// origin as the backend without extra configuration. When the SPA is served
// from a subdirectory (e.g. https://example.com/erp/), calls should target
// that subdirectory's `/api` namespace instead of the site root.

function detectBaseFromLocation() {
  if (typeof window === 'undefined') return null;
  try {
    const { pathname } = window.location || {};
    if (typeof pathname !== 'string') return null;

    // Trim trailing slashes so `/erp/` becomes `/erp`
    const trimmed = pathname.replace(/\/+$/, '');
    if (!trimmed || trimmed === '/') return null;

    const segments = trimmed.split('/').filter(Boolean);
    if (!segments.length) return null;

    // If the last segment looks like a filename (contains a dot) drop it so
    // `/erp/index.html` still resolves to `/erp`.
    const last = segments[segments.length - 1];
    if (last && last.includes('.')) {
      segments.pop();
    }
    if (!segments.length) return null;

    return `/${segments.join('/')}/api`;
  } catch {
    return null;
  }
}

const detectedBase = detectBaseFromLocation();
const envBase = import.meta.env?.VITE_API_BASE;
const runtimeBase = typeof globalThis !== 'undefined'
  ? globalThis.__ERP_API_BASE__
  : undefined;
const rawBase = envBase || runtimeBase || detectedBase || '/api';
export const API_BASE = rawBase.replace(/\/+$/, '');

// Helper to strip the trailing "/api" segment for building non-API URLs
const root = API_BASE.replace(/\/api\/?$/, '');
export const API_ROOT = root === '' ? '' : root;
