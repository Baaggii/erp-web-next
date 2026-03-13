const headerMappingsByLanguage = new Map();
const headerMappingsPromises = new Map();

export async function getHeaderMappingsForLanguage(language) {
  const langKey = String(language || '').trim() || 'default';
  if (headerMappingsByLanguage.has(langKey)) {
    return headerMappingsByLanguage.get(langKey);
  }
  if (headerMappingsPromises.has(langKey)) {
    return headerMappingsPromises.get(langKey);
  }

  const params = new URLSearchParams();
  if (language) params.set('lang', language);

  const request = fetch(`/api/header_mappings${params.toString() ? `?${params.toString()}` : ''}`, {
    credentials: 'include',
    skipLoader: true,
    skipErrorToast: true,
  })
    .then(async (res) => {
      if (!res.ok) return {};
      return res.json().catch(() => ({}));
    })
    .then((mappings) => {
      const safeMappings = mappings && typeof mappings === 'object' ? mappings : {};
      headerMappingsByLanguage.set(langKey, safeMappings);
      return safeMappings;
    })
    .finally(() => {
      headerMappingsPromises.delete(langKey);
    });

  headerMappingsPromises.set(langKey, request);
  return request;
}

export function clearHeaderMappingsLanguageCache(language) {
  if (!language) {
    headerMappingsByLanguage.clear();
    headerMappingsPromises.clear();
    return;
  }
  const langKey = String(language || '').trim() || 'default';
  headerMappingsByLanguage.delete(langKey);
  headerMappingsPromises.delete(langKey);
}
