export function bootstrapClientEnv() {
  if (typeof window === 'undefined') return;

  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  const posapiEntries = Object.entries(env).reduce((acc, [key, value]) => {
    if (key && key.startsWith('POSAPI_')) {
      acc[key] = value;
    } else if (key && key.startsWith('VITE_POSAPI_')) {
      const normalized = key.replace(/^VITE_/, '');
      acc[normalized] = value;
    }
    return acc;
  }, {});

  if (Object.keys(posapiEntries).length === 0) return;

  window.__ENV__ = {
    ...(window.__ENV__ || {}),
    ...posapiEntries,
  };
}
