import { useEffect, useState } from 'react';

const cache = { data: null };

export default function useGeneralConfig() {
  const [cfg, setCfg] = useState(cache.data);

  useEffect(() => {
    if (cache.data !== null) {
      setCfg(cache.data);
      return;
    }
    fetch('/api/general_config', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : {}))
      .then(data => {
        cache.data = data;
        setCfg(data);
      })
      .catch(() => setCfg({}));
  }, []);

  return cfg || {};
}
