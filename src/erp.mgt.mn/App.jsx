import React, { useContext, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AuthContextProvider, { AuthContext } from './context/AuthContext.jsx';
import { TabProvider } from './context/TabContext.jsx';
import { TxnSessionProvider } from './context/TxnSessionContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { LoadingProvider } from './context/LoadingContext.jsx';
import { debugLog } from './utils/debug.js';
import RequireAuth from './components/RequireAuth.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/Login.jsx';
import FormsPage from './pages/Forms.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import UserCompaniesPage from './pages/UserCompanies.jsx';
import RolePermissionsPage from './pages/RolePermissions.jsx';
import ActionPermissionsPage from './pages/ActionPermissions.jsx';
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
import BlueLinkPage from './pages/BlueLinkPage.jsx';
import useHeaderMappings from './hooks/useHeaderMappings.js';
import InventoryPage from './pages/InventoryPage.jsx';
import ImageManagementPage from './pages/ImageManagement.jsx';
import FinanceTransactionsPage from './pages/FinanceTransactions.jsx';
import { useModules } from './hooks/useModules.js';
import { useTxnModules } from './hooks/useTxnModules.js';
import useGeneralConfig from './hooks/useGeneralConfig.js';

export default function App() {
  useEffect(() => {
    debugLog('Component mounted: App');
  }, []);

  return (
    <ToastProvider>
      <AuthContextProvider>
        <TxnSessionProvider>
          <LoadingProvider>
            <TabProvider>
              <HashRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route element={<RequireAuth />}>
                    <Route path="/*" element={<AuthedApp />} />
                  </Route>
                </Routes>
              </HashRouter>
            </TabProvider>
          </LoadingProvider>
        </TxnSessionProvider>
      </AuthContextProvider>
    </ToastProvider>
  );
}

function AuthedApp() {
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();
  const headerMap = useHeaderMappings(modules.map((m) => m.module_key));

  const moduleMap = {};
  modules.forEach((m) => {
    const label =
      generalConfig.general?.procLabels?.[m.module_key] ||
      headerMap[m.module_key] ||
      m.label;
    moduleMap[m.module_key] = { ...m, label, children: [] };
  });
  modules.forEach((m) => {
    if (m.parent_key && moduleMap[m.parent_key]) {
      moduleMap[m.parent_key].children.push(moduleMap[m.module_key]);
    }
  });

  const componentMap = {
    dashboard: <BlueLinkPage />,
    forms: <FormsPage />,
    reports: <ReportsPage />,
    settings: <SettingsPage />,
    users: <UsersPage />,
    user_companies: <UserCompaniesPage />,
    role_permissions: <RolePermissionsPage />,
    user_level_actions: <UserLevelActionsPage />,
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
  };

  modules.forEach((m) => {
    if (m.module_key === 'pos_transactions') return;
    if (txnModules.keys.has(m.module_key)) {
      componentMap[m.module_key] = (
        <FinanceTransactionsPage moduleKey={m.module_key} />
      );
    }
  });

  const indexComponents = {
    settings: <GeneralSettings />,
    report_management: <ReportManagementPage />,
  };

  const adminOnly = new Set([
    'users',
    'user_companies',
    'role_permissions',
    'user_level_actions',
    'modules',
    'company_licenses',
    'tables_management',
    'coding_tables',
    'forms_management',
    'relations_config',
    'pos_transaction_management',
    'image_management',
    'general_configuration',
  ]);

  function renderRoute(mod) {
    const slug = mod.module_key.replace(/_/g, '-');
    const children = mod.children.map(renderRoute);
    let element = componentMap[mod.module_key];
    if (!element) {
      element = mod.children.length > 0 ? <Outlet /> : <div>{mod.label}</div>;
    }

    if (adminOnly.has(mod.module_key)) {
      element = <RequireAdminPage>{element}</RequireAdminPage>;
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
  }

  const roots = modules
    .filter((m) => !m.parent_key)
    .map((m) => moduleMap[m.module_key]);

  return (
    <Routes>
      <Route path="/" element={<ERPLayout />}>{roots.map(renderRoute)}</Route>
      <Route
        path="inventory-demo"
        element={
          <AppLayout title="Inventory">
            <InventoryPage />
          </AppLayout>
        }
      />
    </Routes>
  );
}

function RequireAdminPage({ children }) {
  const { user, session } = useContext(AuthContext);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return session?.permissions?.system_settings ? (
    children
  ) : (
    <Navigate to="/" replace />
  );
}
