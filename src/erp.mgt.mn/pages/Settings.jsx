// src/erp.mgt.mn/pages/Settings.jsx
import React, { useEffect, useState } from 'react';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { Outlet, Link } from 'react-router-dom';

export default function SettingsPage() {
  // Just render the nested route content. The left sidebar already
  // exposes settings links, so we do not repeat them here.
  return <Outlet />;
}

export function GeneralSettings() {
  const perms = useRolePermissions();
  if (!perms) {
    return <p>Loading…</p>;
  }
  if (!perms.settings) {
    return <p>Access denied.</p>;
  }
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch settings');
        return res.json();
      })
      .then((json) => setSettings(json))
      .catch((err) => console.error('Error fetching settings:', err));
  }, []);

  return (
    <div>
      <h2>Settings</h2>
      {settings ? (
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      ) : (
        <p>Loading settings…</p>
      )}
      <p style={{ marginTop: '1rem' }}>
        <Link to="/settings/role-permissions">Edit Role Permissions</Link>
      </p>
    </div>
  );
}

