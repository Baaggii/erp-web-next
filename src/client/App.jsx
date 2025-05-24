// src/client/App.jsx
import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Forms from './pages/Forms.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';

export default function App() {
  return (
    <nav>
      <ul>
        <li><Link to="/dashboard">Dashboard</Link></li>
        <li><Link to="/forms">Forms</Link></li>
        <li><Link to="/reports">Reports</Link></li>
        <li><Link to="/users">Users</Link></li>
      </ul>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard/>
            </RequireAuth>
          }
        />
        <Route
          path="/forms"
          element={
            <RequireAuth>
              <Forms/>
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <Reports/>
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth>
              <Users/>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Login />} />
      </Routes>
    </nav>
  );
}
