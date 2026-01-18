let cachedOptions = null;
let cachedPromise = null;

export default async function fetchTenantTableOptions() {
  if (cachedOptions) return cachedOptions;
  if (!cachedPromise) {
    cachedPromise = fetch('/api/tenant_tables/options', {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load tenant table options');
        }
        return res.json();
      })
      .then((data) => {
        cachedOptions = data || [];
        return cachedOptions;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}
