// Prefer an explicit VITE_API_BASE (e.g. https://backend.example.com/api)
// and fall back to a relative "/api" path so the frontend can run behind
// the same origin as the backend without extra configuration.
const env = (typeof import.meta !== 'undefined' && import.meta?.env) || {};
const rawBase = env.VITE_API_BASE || '/api';
export const API_BASE = rawBase.replace(/\/$/, '');

// Helper to strip the trailing "/api" segment for building non-API URLs
export const API_ROOT = API_BASE.replace(/\/api\/?$/, '');
