import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthContextProvider from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import ERPLayout from './components/ERPLayout.jsx';
import LoginPage from './pages/Login.jsx';
import FormsPage from './pages/Forms.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import SettingsPage from './pages/Settings.jsx';
import BlueLinkPage from './pages/BlueLinkPage.jsx';

export default function App() {
  return (
    <AuthContextProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route for login without sidebar/layout */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected app routes */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<ERPLayout />}>
              <Route index element={<BlueLinkPage />} />
              <Route path="forms" element={<FormsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="bluelink" element={<BlueLinkPage />} />
              <Route path="blue-link" element={<BlueLinkPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthContextProvider>
  );
}
