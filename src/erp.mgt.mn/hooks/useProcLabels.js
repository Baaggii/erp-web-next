import { useEffect, useState } from 'react';
import useGeneralConfig, { updateCache } from './useGeneralConfig.js';

export default function useProcLabels(names = []) {
  const generalConfig = useGeneralConfig();
  const [localMap, setLocalMap] = useState({});

  useEffect(() => {
    const procLabels = generalConfig.general?.procLabels || {};
    const missing = names.filter(
      (n) => n && !procLabels[n] && !localMap[n],
    );
    if (missing.length === 0) return;
    const params = new URLSearchParams();
    params.set('headers', missing.join(','));
    fetch(`/api/header_mappings?${params.toString()}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (data && Object.keys(data).length) {
          setLocalMap((m) => ({ ...m, ...data }));
          const existing = generalConfig.general?.procLabels || {};
          updateCache({
            ...generalConfig,
            general: { ...generalConfig.general, procLabels: { ...existing, ...data } },
          });
        }
      })
      .catch(() => {});
  }, [names.join(','), generalConfig.general?.procLabels]);

  const procLabels = generalConfig.general?.procLabels || {};
  return names.reduce((acc, n) => {
    acc[n] = procLabels[n] || localMap[n] || n;
    return acc;
  }, {});
}
