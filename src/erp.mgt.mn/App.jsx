import React, { Suspense, lazy, useMemo } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import { TabProvider } from './context/TabContext.jsx';
import { TxnSessionProvider } from './context/TxnSessionContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { LoadingProvider } from './context/LoadingContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import useAppBootstrap from './hooks/useAppBootstrap.js';
import buildPermittedRoutes from './routes/buildPermittedRoutes.js';
import AppShell from './components/AppShell.jsx';

const LoginPage = lazy(() => import('./pages/Login.jsx'));

function BootstrapLoadingShell() {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ height: 18, width: 200, background: '#e5e7eb', marginBottom: 8 }} />
      <div style={{ height: 12, width: '70%', background: '#f3f4f6' }} />
    </div>
  );
}

function AuthedApp() {
  const { data, loading, error } = useAppBootstrap();

  const routes = useMemo(() => {
    if (!data?.modules) return [];
    return buildPermittedRoutes(data.modules, data.permissions);
  }, [data?.modules, data?.permissions]);

  if (loading) return <BootstrapLoadingShell />;
  if (error) return <div style={{ padding: 12 }}>Failed to bootstrap app shell.</div>;

  return <AppShell bootstrap={data} routes={routes} />;
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthContextProvider>
          <TxnSessionProvider>
            <LoadingProvider>
              <TabProvider>
                <HashRouter>
                  <ErrorBoundary>
                    <Suspense fallback={<BootstrapLoadingShell />}>
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />
                      <Route element={<RequireAuth />}>
                        <Route path="/*" element={<AuthedApp />} />
                      </Route>
                    </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </HashRouter>
              </TabProvider>
            </LoadingProvider>
          </TxnSessionProvider>
        </AuthContextProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
