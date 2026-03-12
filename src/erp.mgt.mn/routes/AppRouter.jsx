import React, { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PageSuspenseBoundary from '../components/PageSuspenseBoundary.jsx';

export default function AppRouter({ routes = [] }) {
  const routeElements = useMemo(
    () =>
      routes.map((route) => {
        const { Component } = route;
        return (
          <Route
            key={route.id}
            path={route.path === '/' ? '/' : route.path.replace(/^\//, '')}
            element={
              <PageSuspenseBoundary>
                <Component moduleKey={route.moduleKey} />
              </PageSuspenseBoundary>
            }
          />
        );
      }),
    [routes],
  );

  const fallbackPath = routes[0]?.path || '/';

  return (
    <Routes>
      {routeElements}
      <Route path="*" element={<Navigate to={fallbackPath} replace />} />
    </Routes>
  );
}
