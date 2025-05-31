import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
    // Wrap entire app in AuthProvider so that `useAuth`/AuthContext work
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 1. Public route: /login */}
          <Route path="/login" element={<LoginForm />} />

          {/* 2. Any “/” routes (index, /users, /companies, /settings, etc.) must be nested under ERPLayout */}
          <Route path="/" element={<ERPLayout />}>
            {/* a) "/" (dashboard) */}
            <Route index element={<Dashboard />} />

            {/* b) "/users" */}
            <Route path="users" element={<UsersPage />} />

            {/* c) "/companies" */}
            <Route path="companies" element={<CompaniesPage />} />

            {/* d) "/settings" */}
            <Route path="settings" element={<SettingsPage />} />

            {/* …you can add more protected routes here… */}
          </Route>

          {/* 3. Catch‐all: if no route matches, redirect to /login (or you could show a 404) */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}