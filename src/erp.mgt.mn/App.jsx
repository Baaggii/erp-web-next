import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LoginPage from './pages/Login.jsx';

export default function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Protected app routes */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<ERPLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="forms" element={<FormsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}
