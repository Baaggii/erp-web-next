import React, { useEffect, useRef, useState } from 'react';

export default function LazyHydrate({ mode = 'idle', children, rootMargin = '150px' }) {
  const [enabled, setEnabled] = useState(mode === 'immediate');
  const markerRef = useRef(null);

  useEffect(() => {
    if (mode === 'immediate') {
      setEnabled(true);
      return undefined;
    }

    if (mode === 'idle') {
      const scheduleIdle =
        typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
          ? window.requestIdleCallback
          : (cb) => setTimeout(cb, 1);
      const cancelIdle =
        typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function'
          ? window.cancelIdleCallback
          : clearTimeout;

      const id = scheduleIdle(() => setEnabled(true));
      return () => cancelIdle(id);
    }

    if (mode === 'visible') {
      const target = markerRef.current;
      if (!target || typeof IntersectionObserver === 'undefined') {
        setEnabled(true);
        return undefined;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setEnabled(true);
            observer.disconnect();
          }
        },
        { rootMargin },
      );
      observer.observe(target);
      return () => observer.disconnect();
    }

    return undefined;
  }, [mode, rootMargin]);

  return <div ref={markerRef}>{enabled ? children : null}</div>;
}
