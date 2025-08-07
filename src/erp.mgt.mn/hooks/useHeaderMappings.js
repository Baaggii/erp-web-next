import { useEffect, useState } from 'react';

const cache = {};

export default function useHeaderMappings(headers = []) {
  const [map, setMap] = useState({});

  useEffect(() => {
    const unique = Array.from(new Set(headers.filter(Boolean)));
    if (unique.length === 0) {
      setMap({});
      return;
    }
    const missing = unique.filter((h) => cache[h] === undefined);
    if (missing.length > 0) {
      const params = new URLSearchParams();
      params.set('headers', missing.join(','));
      fetch(`/api/header_mappings?${params.toString()}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => {
          Object.assign(cache, data);
          const result = {};
          unique.forEach((h) => {
            if (cache[h] !== undefined) result[h] = cache[h];
          });
          setMap(result);
        })
        .catch(() => {
          const result = {};
          unique.forEach((h) => {
            if (cache[h] !== undefined) result[h] = cache[h];
          });
          setMap(result);
        });
    } else {
      const result = {};
      unique.forEach((h) => {
        if (cache[h] !== undefined) result[h] = cache[h];
      });
      setMap(result);
    }
  }, [headers.join(',')]);

  return map;
}
