// src/erp.mgt.mn/pages/Dashboard.jsx
import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import TabbedWindows from '../components/TabbedWindows.jsx';
import MosaicLayout from '../components/MosaicLayout.jsx';

export default function Dashboard() {
  const { user } = useContext(AuthContext);

  return (
    <div>
      <h2>Dashboard</h2>
      <p>Welcome to the ERP dashboard{user ? `, ${user.email}` : ''}!</p>
      <p>Select a module from the sidebar on the left.</p>
      <p>
        Welcome to the ERP dashboard{user ? `, ${user.email}` : ''}!
      </p>
      <p>
        Select a module from the sidebar on the left, or use the top header
        buttons to navigate.
      </p>
      <div style={{ marginTop: '1rem' }}>
        <TabbedWindows />
      </div>
    </div>
  );
}
