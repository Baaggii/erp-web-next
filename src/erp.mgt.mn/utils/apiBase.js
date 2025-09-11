// Prefer an explicit VITE_API_BASE and ensure a leading "/" unless it's an absolute URL.
const raw = import.meta.env.VITE_API_BASE || '/api';
export const API_BASE = raw.startsWith('http')
  ? raw.replace(/\/$/, '')
  : `/${raw.replace(/^\/|\/$/g, '')}`;
export const API_ROOT = API_BASE.replace(/\/api$/, '');
