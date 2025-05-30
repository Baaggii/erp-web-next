import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
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
          {/* Public route for login without sidebar/layout */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected app routes */}
          <Route path="/*" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="forms" element={<FormsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}