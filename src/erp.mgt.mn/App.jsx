import React, { useContext } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import AuthContextProvider, { AuthContext } from './context/AuthContext.jsx';
import { TabProvider } from './context/TabContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import AppLayout from './components/AppLayout.jsx';
import LoginPage from './pages/Login.jsx';
import FormsPage from './pages/Forms.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import UserCompaniesPage from './pages/UserCompanies.jsx';
import RolePermissionsPage from './pages/RolePermissions.jsx';
import CompanyLicensesPage from './pages/CompanyLicenses.jsx';
import TablesManagementPage from './pages/TablesManagement.jsx';
import CodingTablesPage from './pages/CodingTables.jsx';
import FormsManagementPage from './pages/FormsManagement.jsx';
import ReportManagementPage from './pages/ReportManagement.jsx';
import ModulesPage from './pages/Modules.jsx';
import SettingsPage, { GeneralSettings } from './pages/Settings.jsx';
import ChangePasswordPage from './pages/ChangePassword.jsx';
import BlueLinkPage from './pages/BlueLinkPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import FinanceTransactionsPage from './pages/FinanceTransactions.jsx';
import { useModules } from './hooks/useModules.js';

export default function App() {
  const modules = useModules();

  const moduleMap = {};
  modules.forEach((m) => {
    moduleMap[m.module_key] = { ...m, children: [] };
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
    modules: <ModulesPage />,
    company_licenses: <CompanyLicensesPage />,
    tables_management: <TablesManagementPage />,
    coding_tables: <CodingTablesPage />,
    forms_management: <FormsManagementPage />,
    report_management: <ReportManagementPage />,
    change_password: <ChangePasswordPage />,
    finance_transactions: <FinanceTransactionsPage />,
  };

  modules.forEach((m) => {
    if (m.parent_key === 'finance_transactions') {
      componentMap[m.module_key] = (
        <FinanceTransactionsPage defaultName={m.label} hideSelector />
      );
    }
  });

  const indexComponents = {
    settings: <GeneralSettings />,
  };

  const adminOnly = new Set([
    'users',
    'user_companies',
    'role_permissions',
    'modules',
    'company_licenses',
    'tables_management',
    'coding_tables',
    'forms_management',
    'report_management',
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
    <ToastProvider>
      <AuthContextProvider>
        <TabProvider>
          <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/" element={<ERPLayout />}>{roots.map(renderRoute)}</Route>
              <Route
                path="/inventory-demo"
                element={
                  <AppLayout title="Inventory">
                    <InventoryPage />
                  </AppLayout>
                }
              />
            </Route>
          </Routes>
          </HashRouter>
        </TabProvider>
      </AuthContextProvider>
    </ToastProvider>
  );
}

function RequireAdminPage({ children }) {
  const { user } = useContext(AuthContext);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return user.role === 'admin' ? children : <Navigate to="/" replace />;
}
