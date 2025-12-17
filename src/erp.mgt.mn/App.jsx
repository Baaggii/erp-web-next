import React, { useEffect, useMemo, useCallback } from 'react';
import { HashRouter, Routes, Route, Outlet } from 'react-router-dom';
import AuthContextProvider, { AuthContext } from './context/AuthContext.jsx';
import { TabProvider } from './context/TabContext.jsx';
import { TxnSessionProvider } from './context/TxnSessionContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { LoadingProvider } from './context/LoadingContext.jsx';
import { I18nProvider } from './context/I18nContext.jsx';
import { debugLog } from './utils/debug.js';
import RequireAuth from './components/RequireAuth.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/Login.jsx';
import FormsPage from './pages/Forms.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import CompaniesPage from './pages/Companies.jsx';
import RolePermissionsPage from './pages/RolePermissions.jsx';
import CompanyLicensesPage from './pages/CompanyLicenses.jsx';
import TablesManagementPage from './pages/TablesManagement.jsx';
import CodingTablesPage from './pages/CodingTables.jsx';
import FormsManagementPage from './pages/FormsManagement.jsx';
import ReportManagementPage from './pages/ReportManagement.jsx';
import ReportBuilderPage from './pages/ReportBuilder.jsx';
import RelationsConfigPage from './pages/RelationsConfig.jsx';
import PosTxnConfigPage from './pages/PosTxnConfig.jsx';
import PosTransactionsPage from './pages/PosTransactions.jsx';
import ModulesPage from './pages/Modules.jsx';
import GeneralConfigurationPage from './pages/GeneralConfiguration.jsx';
import UserLevelActionsPage from './pages/UserLevelActions.jsx';
import SettingsPage, { GeneralSettings } from './pages/Settings.jsx';
import ChangePasswordPage from './pages/ChangePassword.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import useHeaderMappings from './hooks/useHeaderMappings.js';
import InventoryPage from './pages/InventoryPage.jsx';
import ImageManagementPage from './pages/ImageManagement.jsx';
import FinanceTransactionsPage from './pages/FinanceTransactions.jsx';
import RequestsPage from './pages/Requests.jsx';
import { useModules } from './hooks/useModules.js';
import { useTxnModules } from './hooks/useTxnModules.js';
import useGeneralConfig from './hooks/useGeneralConfig.js';
import TabbedWindows from './components/TabbedWindows.jsx';
import TenantTablesRegistryPage from './pages/TenantTablesRegistry.jsx';
import TranslationEditorPage from './pages/TranslationEditor.jsx';
import UserManualExportPage from './pages/UserManualExport.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import UserSettingsPage from './pages/UserSettings.jsx';
import AllowedReportsConfigPage from './pages/AllowedReportsConfig.jsx';
import NotificationsPage from './pages/Notifications.jsx';
import PosApiAdminPage from './pages/PosApiAdmin.jsx';
import { TemporarySummaryProvider } from './context/TemporarySummaryContext.jsx';

export default function App() {
  useEffect(() => {
    debugLog('Component mounted: App');
  }, []);

  return (
    <I18nProvider>
      <ToastProvider>
        <AuthContextProvider>
          <TxnSessionProvider>
            <LoadingProvider>
              <TabProvider>
                <HashRouter>
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />
                      <Route element={<RequireAuth />}>
                        <Route path="/*" element={<AuthedApp />} />
                      </Route>
                    </Routes>
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

function AuthedApp() {
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();

  // memoize module keys so the array passed to useHeaderMappings has a stable identity
  const moduleKeys = useMemo(() => modules.map((m) => m.module_key), [modules]);
  const headerMap = useHeaderMappings(moduleKeys);

  // Build module hierarchy only when its inputs change
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

  // Map module keys to components; dynamic finance modules are merged here
  const componentMap = useMemo(() => {
    const map = {
      dashboard: <DashboardPage />,
      forms: <FormsPage />,
      reports: <ReportsPage />,
      settings: <SettingsPage />,
      users: <UsersPage />,
      companies: <CompaniesPage />,
      role_permissions: <RolePermissionsPage />,
      user_level_actions: <UserLevelActionsPage />,
      user_settings: <UserSettingsPage />,
      modules: <ModulesPage />,
      company_licenses: <CompanyLicensesPage />,
      tables_management: <TablesManagementPage />,
      coding_tables: <CodingTablesPage />,
      forms_management: <FormsManagementPage />,
      report_builder: <ReportBuilderPage />,
      relations_config: <RelationsConfigPage />,
      pos_transaction_management: <PosTxnConfigPage />,
      pos_transactions: <PosTransactionsPage />,
      general_configuration: <GeneralConfigurationPage />,
      image_management: <ImageManagementPage />,
      change_password: <ChangePasswordPage />,
      requests: <RequestsPage />,
      sales: <TabbedWindows />,
      tenant_tables_registry: <TenantTablesRegistryPage />,
      edit_translations: <TranslationEditorPage />,
      user_manual_export: <UserManualExportPage />,
      report_access: <AllowedReportsConfigPage />,
    };

    modules.forEach((m) => {
      if (m.module_key === 'pos_transactions') return;
      if (txnModules.keys.has(m.module_key)) {
        map[m.module_key] = (
          <FinanceTransactionsPage moduleKey={m.module_key} />
        );
      }
    });
    return map;
  }, [modules, txnModules]);

  // Index routes that should remain stable between renders
  const indexComponents = useMemo(
    () => ({
      settings: <GeneralSettings />,
      report_management: <ReportManagementPage />,
    }),
    []
  );

  // Recursive route renderer; memoized to keep function identity stable
  const renderRoute = useCallback(
    function renderRoute(mod) {
      const slug = mod.module_key.replace(/_/g, '-');
      const children = mod.children.map((child) => renderRoute(child));
      let element = componentMap[mod.module_key];
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
    [componentMap, indexComponents]
  );

  // Top-level modules for routing; computed only when inputs change
  const roots = useMemo(
    () => modules.filter((m) => !m.parent_key).map((m) => moduleMap[m.module_key]),
    [modules, moduleMap]
  );

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/"
          element={(
            <TemporarySummaryProvider>
              <ERPLayout />
            </TemporarySummaryProvider>
          )}
        >
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route element={<RequireAdmin />}>
            <Route
              path="settings/posapi-endpoints"
              element={<PosApiAdminPage />}
            />
          </Route>
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
    </ErrorBoundary>
  );
}
