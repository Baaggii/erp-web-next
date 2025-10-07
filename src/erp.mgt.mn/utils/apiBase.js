// Prefer an explicit VITE_API_BASE (e.g. https://backend.example.com/api)
// and fall back to a relative "/api" path so the frontend can run behind
// the same origin as the backend without extra configuration. When running
// from a statically-hosted build there is no compile-time environment, so we
// additionally honour a few runtime configuration entry points (global
// variables or meta tags) to make it easier to point the SPA at the correct
// backend without rebuilding.

function runtimeApiBase() {
  if (typeof window === 'undefined') return undefined;

  const globalBase =
    window.__ERP_API_BASE__ ||
    window.__ERP_CONFIG__?.apiBase ||
    window.ERP_API_BASE ||
    window.__CONFIG__?.apiBase;

  if (globalBase) return globalBase;

  const meta = typeof document !== 'undefined'
    ? document.querySelector('meta[name="erp-api-base"]')
    : null;
  if (meta?.content) return meta.content;

  return undefined;
}

const rawBase =
  (import.meta.env?.VITE_API_BASE || runtimeApiBase() || '/api').trim();

export const API_BASE = rawBase.replace(/\/$/, '');

// Helper to strip the trailing "/api" segment for building non-API URLs
export const API_ROOT = API_BASE.replace(/\/api\/?$/, '');
