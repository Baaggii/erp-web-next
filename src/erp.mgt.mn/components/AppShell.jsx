import React, { useEffect, useMemo } from 'react';
import SidebarMenu from './SidebarMenu.jsx';
import AppRouter from '../routes/AppRouter.jsx';
import { preloadRouteBundle } from '../routes/routeRegistry.js';

function scheduleIdle(callback) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 1500 });
  }
  return setTimeout(callback, 600);
}

function cancelIdle(id) {
  if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
    return;
  }
  clearTimeout(id);
}

export default function AppShell({ bootstrap, routes }) {
  const sortedPreloadCandidates = useMemo(
    () =>
      [...routes]
        .filter((route) => route.path !== '/')
        .sort((a, b) => (b.preloadPriority || 0) - (a.preloadPriority || 0))
        .slice(0, 2),
    [routes],
  );

  useEffect(() => {
    const idleId = scheduleIdle(() => {
      sortedPreloadCandidates.forEach((route) => {
        // Only preload page bundles (JS chunks). We intentionally avoid prefetching API data.
        preloadRouteBundle(route);
      });
    });
    return () => cancelIdle(idleId);
  }, [sortedPreloadCandidates]);

  return (
    <div style={{ display: 'grid', gridTemplateRows: '48px 1fr', height: '100vh' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', padding: '0 12px', alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
        <strong>ERP</strong>
        <small>{bootstrap?.user?.username || bootstrap?.user?.name || 'User'}</small>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 0 }}>
        <aside style={{ overflow: 'auto', borderRight: '1px solid #e5e7eb', padding: 8 }}>
          <SidebarMenu items={routes} />
        </aside>
        <main style={{ overflow: 'auto' }}>
          <AppRouter routes={routes} />
        </main>
      </div>
    </div>
  );
}
