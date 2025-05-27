// File: src/client/App.jsx

import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import RequireAuth from './components/RequireAuth.jsx';

import Login     from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Forms     from './pages/Forms.jsx';
import Reports   from './pages/Reports.jsx';
import Users     from './pages/Users.jsx';

export default function App() {
  const { user, logout } = useAuth();

  return (
    <>
      <nav>
        <Link to="/dashboard">Dashboard</Link> |{' '}
        <Link to="/forms">Forms</Link> |{' '}
        <Link to="/reports">Reports</Link> |{' '}
        <Link to="/users">Users</Link>
        {user && (
          <> | <button onClick={logout}>Logout</button></>
        )}
      </nav>

      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        <Route
          path="/forms"
          element={
            <RequireAuth>
              <Forms />
            </RequireAuth>
          }
        />

        <Route
          path="/reports"
          element={
            <RequireAuth>
              <Reports />
            </RequireAuth>
          }
        />

        <Route
          path="/users"
          element={
            <RequireAuth>
              <Users />
            </RequireAuth>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Login />} />
      </Routes>
    </>
  );
}
