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
import SettingsPage from './pages/Settings.jsx';
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
              <Route element={<RequireAdmin />}>
                <Route path="users" element={<UsersPage />} />
                <Route path="user-companies" element={<UserCompaniesPage />} />
              </Route>
              <Route path="settings" element={<SettingsPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
            </Route>
          </Route>
        </Routes>
      </HashRouter>
    </AuthContextProvider>
  );
}
