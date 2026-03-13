const displayFieldsCache = new Map();
const displayFieldsPromises = new Map();

function normalizeConfig(config, fallbackIdField = '') {
  return {
    idField:
      typeof config?.idField === 'string' && config.idField.trim()
        ? config.idField
        : fallbackIdField,
    displayFields: Array.isArray(config?.displayFields) ? config.displayFields : [],
  };
}

export async function getDisplayFieldsBatch(tables = []) {
  const uniqueTables = Array.from(
    new Set((tables || []).map((table) => String(table || '').trim()).filter(Boolean)),
  );
  const missing = uniqueTables.filter((table) => !displayFieldsCache.has(table));
  if (missing.length === 0) {
    return Object.fromEntries(uniqueTables.map((table) => [table, displayFieldsCache.get(table)]));
  }

  const batchKey = missing.sort().join(',');
  if (!displayFieldsPromises.has(batchKey)) {
    const params = new URLSearchParams({ tables: missing.join(',') });
    const request = fetch(`/api/display_fields/batch?${params.toString()}`, {
      credentials: 'include',
      skipLoader: true,
      skipErrorToast: true,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('batch display_fields request failed');
        return res.json().catch(() => ({}));
      })
      .then((payload) => {
        missing.forEach((table) => {
          displayFieldsCache.set(table, normalizeConfig(payload?.[table], ''));
        });
      })
      .catch(async () => {
        await Promise.all(
          missing.map(async (table) => {
            try {
              const res = await fetch(
                `/api/display_fields?table=${encodeURIComponent(table)}`,
                { credentials: 'include', skipLoader: true, skipErrorToast: true },
              );
              const cfg = res.ok ? await res.json().catch(() => ({})) : {};
              displayFieldsCache.set(table, normalizeConfig(cfg, ''));
            } catch {
              displayFieldsCache.set(table, normalizeConfig({}, ''));
            }
          }),
        );
      })
      .finally(() => {
        displayFieldsPromises.delete(batchKey);
      });

    displayFieldsPromises.set(batchKey, request);
  }

  await displayFieldsPromises.get(batchKey);
  return Object.fromEntries(uniqueTables.map((table) => [table, displayFieldsCache.get(table)]));
}

export function clearDisplayFieldsCache() {
  displayFieldsCache.clear();
  displayFieldsPromises.clear();
}
