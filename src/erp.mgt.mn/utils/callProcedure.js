export default async function callProcedure(name, params = [], aliases = []) {
  const res = await fetch('/api/procedures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, params, aliases }),
  });
  if (!res.ok) {
    return {};
  }
  const js = await res.json().catch(() => ({}));
  return js.row || {};
}
