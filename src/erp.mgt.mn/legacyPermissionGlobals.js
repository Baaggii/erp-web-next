if (typeof window !== 'undefined') {
  // Keep legacy scripts that expect a dotted global namespace (window.erp.mgt.mn)
  // from crashing when they run before modern app state initializes.
  window.erp = window.erp && typeof window.erp === 'object' ? window.erp : {};
  window.erp.mgt =
    window.erp.mgt && typeof window.erp.mgt === 'object' ? window.erp.mgt : {};
  window.erp.mgt.mn =
    window.erp.mgt.mn && typeof window.erp.mgt.mn === 'object'
      ? window.erp.mgt.mn
      : {};

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
