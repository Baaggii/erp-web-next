import React, {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { HashRouter, Routes, Route, Outlet } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import { TabProvider } from './context/TabContext.jsx';
import { TxnSessionProvider } from './context/TxnSessionContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { LoadingProvider } from './context/LoadingContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import { SessionProvider } from './context/SessionContext.jsx';
import { debugLog } from './utils/debug.js';
import RequireAuth from './components/RequireAuth.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import AppLayout from './components/AppLayout.jsx';
import useHeaderMappings from './hooks/useHeaderMappings.js';
import { useModules } from './hooks/useModules.js';
import { useTxnModules } from './hooks/useTxnModules.js';
import useGeneralConfig from './hooks/useGeneralConfig.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Route-level lazy loading keeps the initial bundle small and speeds up first paint.
const LoginPage = lazy(() => import('./pages/Login.jsx'));
const FormsPage = lazy(() => import('./pages/Forms.jsx'));
const ReportsPage = lazy(() => import('./pages/Reports.jsx'));
const UsersPage = lazy(() => import('./pages/Users.jsx'));
const CompaniesPage = lazy(() => import('./pages/Companies.jsx'));
const RolePermissionsPage = lazy(() => import('./pages/RolePermissions.jsx'));
const CompanyLicensesPage = lazy(() => import('./pages/CompanyLicenses.jsx'));
const TablesManagementPage = lazy(() => import('./pages/TablesManagement.jsx'));
const CodingTablesPage = lazy(() => import('./pages/CodingTables.jsx'));
const FormsManagementPage = lazy(() => import('./pages/FormsManagement.jsx'));
const ReportManagementPage = lazy(() => import('./pages/ReportManagement.jsx'));
const ReportBuilderPage = lazy(() => import('./pages/ReportBuilder.jsx'));
const RelationsConfigPage = lazy(() => import('./pages/RelationsConfig.jsx'));
const PosTxnConfigPage = lazy(() => import('./pages/PosTxnConfig.jsx'));
const PosTransactionsPage = lazy(() => import('./pages/PosTransactions.jsx'));
const ModulesPage = lazy(() => import('./pages/Modules.jsx'));
const GeneralConfigurationPage = lazy(() => import('./pages/GeneralConfiguration.jsx'));
const UserLevelActionsPage = lazy(() => import('./pages/UserLevelActions.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const GeneralSettingsPage = lazy(() =>
  import('./pages/Settings.jsx').then((module) => ({ default: module.GeneralSettings })),
);
const ChangePasswordPage = lazy(() => import('./pages/ChangePassword.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const InventoryPage = lazy(() => import('./pages/InventoryPage.jsx'));
const ImageManagementPage = lazy(() => import('./pages/ImageManagement.jsx'));
const FinanceTransactionsPage = lazy(() => import('./pages/FinanceTransactions.jsx'));
const RequestsPage = lazy(() => import('./pages/Requests.jsx'));
const TabbedWindows = lazy(() => import('./components/TabbedWindows.jsx'));
const TenantTablesRegistryPage = lazy(() => import('./pages/TenantTablesRegistry.jsx'));
const TranslationEditorPage = lazy(() => import('./pages/TranslationEditor.jsx'));
const UserManualExportPage = lazy(() => import('./pages/UserManualExport.jsx'));
const UserSettingsPage = lazy(() => import('./pages/UserSettings.jsx'));
const AllowedReportsConfigPage = lazy(() => import('./pages/AllowedReportsConfig.jsx'));
const PosApiAdminPage = lazy(() => import('./pages/PosApiAdmin.jsx'));
const CncProcessingPage = lazy(() => import('./pages/CncProcessingPage.jsx'));
const AccountingPeriodsPage = lazy(() => import('./pages/AccountingPeriods.jsx'));

function PageSkeleton() {
  return (
    <div style={{ padding: '1rem', opacity: 0.75 }} aria-busy="true">
      Loading…
    </div>
  );
}

export default function App() {
  useEffect(() => {
    debugLog('Component mounted: App');
  }, []);

  return (
    <I18nProvider>
      <ToastProvider>
        <SessionProvider>
          <AuthContextProvider>
            <TxnSessionProvider>
            <LoadingProvider>
              <TabProvider>
                <HashRouter>
                  <ErrorBoundary>
                    <Suspense fallback={<PageSkeleton />}>
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
        </SessionProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

function AuthedApp() {
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();

  const moduleKeys = useMemo(() => modules.map((m) => m.module_key), [modules]);
  const headerMap = useHeaderMappings(moduleKeys);

  const moduleMap = useMemo(() => {
    const map = {};
    modules.forEach((m) => {
      const label =
        generalConfig.general?.procLabels?.[m.module_key] ||
        headerMap[m.module_key] ||
        m.label;
      map[m.module_key] = { ...m, label, children: [] };
    });
    modules.forEach((m) => {
      if (m.parent_key && map[m.parent_key]) {
        map[m.parent_key].children.push(map[m.module_key]);
      }
    });
    return map;
  }, [modules, generalConfig, headerMap]);

  // Use factories instead of eager JSX to avoid initializing route components too early.
  const componentMap = useMemo(() => {
    const map = {
      dashboard: () => <DashboardPage />,
      forms: () => <FormsPage />,
      reports: () => <ReportsPage />,
      settings: () => <SettingsPage />,
      users: () => <UsersPage />,
      companies: () => <CompaniesPage />,
      role_permissions: () => <RolePermissionsPage />,
      user_level_actions: () => <UserLevelActionsPage />,
      user_settings: () => <UserSettingsPage />,
      modules: () => <ModulesPage />,
      company_licenses: () => <CompanyLicensesPage />,
      tables_management: () => <TablesManagementPage />,
      coding_tables: () => <CodingTablesPage />,
      forms_management: () => <FormsManagementPage />,
      report_builder: () => <ReportBuilderPage />,
      relations_config: () => <RelationsConfigPage />,
      pos_transaction_management: () => <PosTxnConfigPage />,
      pos_transactions: () => <PosTransactionsPage />,
      general_configuration: () => <GeneralConfigurationPage />,
      image_management: () => <ImageManagementPage />,
      change_password: () => <ChangePasswordPage />,
      requests: () => <RequestsPage />,
      sales: () => <TabbedWindows />,
      tenant_tables_registry: () => <TenantTablesRegistryPage />,
      edit_translations: () => <TranslationEditorPage />,
      user_manual_export: () => <UserManualExportPage />,
      report_access: () => <AllowedReportsConfigPage />,
      cnc_processing: () => <CncProcessingPage />,
      accounting_periods: () => <AccountingPeriodsPage />,
    };

    modules.forEach((m) => {
      if (m.module_key === 'pos_transactions') return;
      if (txnModules.keys.has(m.module_key)) {
        map[m.module_key] = () => <FinanceTransactionsPage moduleKey={m.module_key} />;
      }
    });
    return map;
  }, [modules, txnModules]);

  const indexComponents = useMemo(
    () => ({
      settings: <GeneralSettingsPage />,
      report_management: <ReportManagementPage />,
    }),
    [],
  );

  const renderRoute = useCallback(
    function renderRoute(mod) {
      const slug = mod.module_key.replace(/_/g, '-');
      const children = mod.children.map((child) => renderRoute(child));
      const elementFactory = componentMap[mod.module_key];
      let element = elementFactory ? elementFactory() : null;
      if (!element) {
        element = mod.children.length > 0 ? <Outlet /> : <div>{mod.label}</div>;
      }

      if (!mod.parent_key && mod.module_key === 'dashboard') {
        return <Route key={mod.module_key} index element={element} />;
      }

      return (
        <Route key={mod.module_key} path={slug} element={element}>
          {indexComponents[mod.module_key] && (
            <Route index element={indexComponents[mod.module_key]} />
          )}
          {children}
        </Route>
      );
    },
    [componentMap, indexComponents],
  );

  const roots = useMemo(
    () => modules.filter((m) => !m.parent_key).map((m) => moduleMap[m.module_key]),
    [modules, moduleMap],
  );

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/" element={<ERPLayout />}>
            <Route path="requests" element={<RequestsPage />} />
            <Route element={<RequireAdmin />}>
              <Route
                path="settings/posapi-endpoints"
                element={<PosApiAdminPage />}
              />
            </Route>
            <Route path="accounting-periods" element={<AccountingPeriodsPage />} />
            {roots.map(renderRoute)}
          </Route>
          <Route
            path="inventory-demo"
            element={
              <AppLayout title="Inventory">
                <InventoryPage />
              </AppLayout>
            }
          />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
