// Prefer an explicit VITE_API_BASE (e.g. https://backend.example.com/api)
// and fall back to a relative "/api" path so the frontend can run behind
// the same origin as the backend without extra configuration.
// Vite injects import.meta.env; guard for Node test environments where it may be undefined
const rawBase = (import.meta.env && import.meta.env.VITE_API_BASE) || '/api';
export const API_BASE = rawBase.replace(/\/$/, '');

// Helper to strip the trailing "/api" segment for building non-API URLs
export const API_ROOT = API_BASE.replace(/\/api\/?$/, '');
