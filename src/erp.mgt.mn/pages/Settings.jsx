// src/erp.mgt.mn/pages/Settings.jsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { Outlet, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TooltipWrapper from '../components/TooltipWrapper.jsx';

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
  const { t } = useTranslation(['translation', 'tooltip']);

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
      <TooltipWrapper title={t('settings_header', { ns: 'tooltip', defaultValue: 'Application settings' })}>
        <h2>Тохиргоо</h2>
      </TooltipWrapper>
      {settings ? (
        <pre>{JSON.stringify(settings, null, 2)}</pre>
      ) : (
        <p>Тохиргоо ачааллаж байна…</p>
      )}
      <p style={{ marginTop: '1rem' }}>
        <TooltipWrapper title={t('edit_role_permissions', { ns: 'tooltip', defaultValue: 'Edit role permissions' })}>
          <Link to="/settings/role-permissions">Эрхийн тохиргоо засах</Link>
        </TooltipWrapper>
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        <TooltipWrapper title={t('tenant_tables_registry', { ns: 'tooltip', defaultValue: 'Manage tenant tables' })}>
          <Link to="/settings/tenant-tables-registry">
            {t('settings_tenant_tables_registry', 'Tenant Tables Registry')}
          </Link>
        </TooltipWrapper>
      </p>
      <p style={{ marginTop: '0.5rem' }}>
        <TooltipWrapper title={t('edit_translations', { ns: 'tooltip', defaultValue: 'Modify translations' })}>
          <Link to="/settings/edit-translations">
            {t('settings_translations', 'Edit Translations')}
          </Link>
        </TooltipWrapper>
      </p>
    </div>
  );
}

