import { createLazyRouteEntry } from './routeRegistry.js';

function canViewModule(module, permissions) {
  if (!module) return false;
  if (module.show_in_sidebar === false && module.show_in_header === false) return false;
  if (!permissions || typeof permissions !== 'object') return true;

  const { modules } = permissions;
  if (!Array.isArray(modules) || modules.length === 0) return true;
  return modules.includes(module.module_key);
}

export default function buildPermittedRoutes(menuMetadata = [], permissions = null) {
  return menuMetadata
    .filter((module) => canViewModule(module, permissions))
    .map((module) => createLazyRouteEntry(module));
}
