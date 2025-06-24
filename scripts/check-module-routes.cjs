// Usage: `node scripts/check-module-routes.cjs`
// Prints a warning if any sidebar module does not have a matching route

const fs = require('fs');

const appJsx = fs.readFileSync('src/erp.mgt.mn/App.jsx', 'utf8');
const routeRegex = /path="([^"]+)"/g;
const routePaths = new Set();
let m;
while ((m = routeRegex.exec(appJsx))) {
  let p = m[1];
  if (!p.startsWith('/')) p = '/' + p;
  routePaths.add(p);
}
routePaths.add('/');

const { createRequire } = require('module');
const path = require('path');
const requireModule = createRequire(__filename);
const defaultModules = requireModule('../db/defaultModules.js').default;

const roots = defaultModules
  .filter((m) => m.parentKey === null)
  .map((m) => m.moduleKey);

const settingsChildren = defaultModules
  .filter((m) => m.parentKey === 'settings')
  .map((m) => m.moduleKey);

function modulePath(key, parent) {
  const segments = [];
  let cur = { module_key: key, parent_key: parent };
  while (cur) {
    segments.unshift(cur.module_key.replace(/_/g, '-'));
    cur = cur.parent_key ? { module_key: cur.parent_key, parent_key: null } : null;
  }
  let p = '/' + segments.join('/');
  if (p === '/dashboard') p = '/';
  return p;
}

function pathExists(p) {
  if (routePaths.has(p)) return true;
  const alt = p === '/' ? '/' : p.replace(/^\//, '');
  if (routePaths.has('/' + alt)) return true;
  return false;
}

const expectedPaths = [];
roots.forEach(k => expectedPaths.push(modulePath(k, null)));
settingsChildren.forEach(k => expectedPaths.push(modulePath(k, 'settings')));

const unmatched = expectedPaths.filter(p => !pathExists(p));

if (unmatched.length === 0) {
  console.log('All sidebar modules have matching routes.');
} else {
  console.log('Routes missing for modules:');
  unmatched.forEach(p => console.log('  ' + p));
}
