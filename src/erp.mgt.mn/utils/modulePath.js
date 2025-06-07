export default function modulePath(mod, map) {
  const segments = [];
  let cur = mod;
  while (cur) {
    segments.unshift(cur.module_key.replace(/_/g, '-'));
    cur = cur.parent_key ? map[cur.parent_key] : null;
  }
  let path = '/' + segments.join('/');
  if (path === '/dashboard') path = '/';
  return path;
}
