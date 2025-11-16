export function buildModulePath(modules, targetKey) {
  if (!Array.isArray(modules) || !targetKey) return null;

  const map = new Map();
  modules.forEach((mod) => {
    if (mod && typeof mod === 'object' && mod.module_key) {
      map.set(mod.module_key, mod);
    }
  });

  let current = map.get(targetKey);
  if (!current) return null;

  const visited = new Set();
  const segments = [];

  while (current) {
    if (visited.has(current.module_key)) {
      return null;
    }
    visited.add(current.module_key);
    segments.unshift(current.module_key.replace(/_/g, '-'));
    if (!current.parent_key) break;
    current = map.get(current.parent_key);
  }

  return segments.length > 0 ? `/${segments.join('/')}` : null;
}
