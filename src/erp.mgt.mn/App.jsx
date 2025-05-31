import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LoginPage from './pages/Login.jsx';
import FormsPage from './pages/Forms.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import SettingsPage from './pages/Settings.jsx';

export default function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <Routes>
          {/* 1) Login route (unprotected) */}
          <Route path="/login" element={<LoginPage />} />

          {/* 2) All “/” routes go through RequireAuth → ERPLayout */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <ERPLayout />
              </RequireAuth>
            }
          >
            {/* Nested routes under ERPLayout */}
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* 3) Catch‐all redirects to /login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}