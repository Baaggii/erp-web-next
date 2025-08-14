// src/erp.mgt.mn/pages/Settings.jsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Outlet, Link } from 'react-router-dom';

export default function SettingsPage() {
  // Just render the nested route content. The left sidebar already
  // exposes settings links, so we do not repeat them here.
  return <Outlet />;
}

export function GeneralSettings() {
  const { permissions: perms } = useContext(AuthContext);
  if (!perms) {
    return <p>Уншиж байна…</p>;
  }
  if (!perms.settings) {
    return <p>Хандалт хориглолоо.</p>;
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
      <h2>Тохиргоо</h2>
      {settings ? (
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      ) : (
        <p>Тохиргоо ачааллаж байна…</p>
      )}
      <p style={{ marginTop: '1rem' }}>
        <Link to="/settings/role-permissions">Эрхийн тохиргоо засах</Link>
      </p>
    </div>
  );
}

