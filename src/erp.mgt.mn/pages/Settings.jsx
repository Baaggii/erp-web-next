// src/erp.mgt.mn/pages/Settings.jsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function SettingsPage() {
  // Just render the nested route content. The left sidebar already
  // exposes settings links, so we do not repeat them here.
  return <Outlet />;
}

export function GeneralSettings() {
  const { session, permissions } = useContext(AuthContext);
  const perms = permissions;
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  if (!perms) {
    return <p>Уншиж байна…</p>;
  }
  if (!hasAdmin && !perms.settings) {
    return <p>Хандалт хориглолоо.</p>;
  }
  const [settings, setSettings] = useState(null);
  const { t } = useTranslation();
  const [tooltipsEnabled, setTooltipsEnabled] = useState(() => {
    const val = localStorage.getItem('tooltipsEnabled');
    return val !== 'false';
  });
  const [toursEnabled, setToursEnabled] = useState(() => {
    return localStorage.getItem('settings_enable_tours') === 'true';
  });

  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then((res) => {
        if (!res.ok)
          throw new Error(
            t('settings_fetch_failed', 'Failed to fetch settings'),
          );
        return res.json();
      })
      .then((json) => setSettings(json))
      .catch((err) =>
        console.error(
          t('settings_fetch_error', 'Error fetching settings:'),
          err,
        ),
      );
  }, []);

  return (
    <div>
      <h2>Тохиргоо</h2>
      {settings ? (
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      ) : (
        <p>Тохиргоо ачааллаж байна…</p>
      )}
      <div style={{ marginTop: '1rem' }}>
        <label>
          <input
            type="checkbox"
            checked={tooltipsEnabled}
            onChange={(e) => {
              const v = e.target.checked;
              setTooltipsEnabled(v);
              localStorage.setItem('tooltipsEnabled', String(v));
            }}
          />{' '}
          {t('settings_enable_tooltips', 'Enable tooltips')}
        </label>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        <label>
          <input
            type="checkbox"
            checked={toursEnabled}
            onChange={(e) => {
              const v = e.target.checked;
              setToursEnabled(v);
              localStorage.setItem('settings_enable_tours', String(v));
            }}
          />{' '}
          {t('settings_enable_tours', 'Show page guide')}
        </label>
      </div>
      <p style={{ marginTop: '1rem' }}>
        <Link to="/settings/role-permissions">Эрхийн тохиргоо засах</Link>
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        <Link to="/settings/tenant-tables-registry">
          {t('settings_tenant_tables_registry', 'Tenant Tables Registry')}
        </Link>
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        <Link to="/settings/edit-translations">
          {t('settings_translations', 'Edit Translations')}
        </Link>
      </p>
    </div>
  );
}

