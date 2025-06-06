// src/erp.mgt.mn/pages/Settings.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Settings() {
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
        <Link to="/role-permissions">Edit Role Permissions</Link>
      </p>
    </div>
  );
}
