if (typeof window !== 'undefined') {
  const ensureObject = (name) => {
    const current = window[name];
    if (!current || typeof current !== 'object') {
      window[name] = {};
    }
    if (typeof globalThis !== 'undefined') {
      globalThis[name] = window[name];
    }
  };

  ensureObject('contextPermissions');
  ensureObject('authPermissions');

  if (typeof window.getContextPermissions !== 'function') {
    window.getContextPermissions = () => window.contextPermissions;
  }
  if (typeof window.getAuthPermissions !== 'function') {
    window.getAuthPermissions = () => window.authPermissions;
  }
}
