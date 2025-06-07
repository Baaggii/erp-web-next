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

const roots = ['dashboard','forms','reports','settings'];
const settingsChildren = [
  'users',
  'user_companies',
  'role_permissions',
  'company_licenses',
  'tables_management',
  'forms_management',
  'report_management',
  'change_password',
];

function modulePath(key, parent) {
  const k = key.replace(/_/g, '-');
  if (parent === 'settings') return `/settings/${k}`;
  if (!parent) {
    if (key === 'dashboard') return '/';
    return `/${k}`;
  }
  return `/${k}`;
}

function pathExists(p) {
  if (routePaths.has(p)) return true;
  if (p.startsWith('/settings/') && routePaths.has(p.replace('/settings', ''))) return true;
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
