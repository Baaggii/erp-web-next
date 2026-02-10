import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { trackSetState } from '../utils/debug.js';

const LoadingContext = createContext({ loaders: {} });

export function LoadingProvider({ children }) {
  const [loaders, setLoaders] = useState({});

  useEffect(() => {
    function start(e) {
      const key = (e.detail && e.detail.key) || 'global';
      trackSetState('LoadingProvider.setLoaders');
      setLoaders((l) => ({ ...l, [key]: (l[key] || 0) + 1 }));
    }
    function end(e) {
      const key = (e.detail && e.detail.key) || 'global';
      trackSetState('LoadingProvider.setLoaders');
      setLoaders((l) => ({ ...l, [key]: Math.max(0, (l[key] || 0) - 1) }));
    }
    function clear(e) {
      const key = e?.detail?.key;
      trackSetState('LoadingProvider.setLoaders');
      if (!key) {
        setLoaders({});
        return;
      }
      setLoaders((l) => {
        if (!l[key]) return l;
        const next = { ...l };
        next[key] = 0;
        return next;
      });
    }
    window.addEventListener('loading:start', start);
    window.addEventListener('loading:end', end);
    window.addEventListener('loading:clear', clear);
    return () => {
      window.removeEventListener('loading:start', start);
      window.removeEventListener('loading:end', end);
      window.removeEventListener('loading:clear', clear);
    };
  }, []);

  const value = useMemo(() => ({ loaders }), [loaders]);

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useIsLoading(key = 'global') {
  const { loaders } = useContext(LoadingContext);
  return loaders[key] > 0;
}

export default LoadingContext;
