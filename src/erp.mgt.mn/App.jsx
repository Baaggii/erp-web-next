import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import LoginPage from './pages/Login.jsx';
import FormsPage from './pages/Forms.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import UserCompaniesPage from './pages/UserCompanies.jsx';
import RolePermissionsPage from './pages/RolePermissions.jsx';
import CompanyLicensesPage from './pages/CompanyLicenses.jsx';
import TablesManagementPage from './pages/TablesManagement.jsx';
import FormsManagementPage from './pages/FormsManagement.jsx';
import ReportManagementPage from './pages/ReportManagement.jsx';
import ModulesPage from './pages/Modules.jsx';
import SettingsPage, { GeneralSettings } from './pages/Settings.jsx';
import ChangePasswordPage from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import BlueLinkPage from './pages/BlueLinkPage.jsx';

export default function App() {
  return (
    <AuthContextProvider>
      <HashRouter>
        <Routes>
          {/* Public route for login without sidebar/layout */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected app routes */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<ERPLayout />}>
              <Route index element={<BlueLinkPage />} />
              <Route path="forms" element={<FormsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />}>
                <Route index element={<GeneralSettings />} />
                <Route element={<RequireAdmin />}>
                  <Route path="users" element={<UsersPage />} />
                  <Route path="user-companies" element={<UserCompaniesPage />} />
                  <Route path="role-permissions" element={<RolePermissionsPage />} />
                  <Route path="modules" element={<ModulesPage />} />
                  <Route path="company-licenses" element={<CompanyLicensesPage />} />
                  <Route path="tables-management" element={<TablesManagementPage />} />
                  <Route path="forms-management" element={<FormsManagementPage />} />
                  <Route path="report-management" element={<ReportManagementPage />} />
                </Route>
                <Route path="change-password" element={<ChangePasswordPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthContextProvider>
  );
}
