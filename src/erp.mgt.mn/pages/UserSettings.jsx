import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTour } from '../components/ERPLayout.jsx';
import userSettingsSteps from '../tours/UserSettings.js';

export default function UserSettingsPage() {
  const { t } = useTranslation();
  const steps = useMemo(() => userSettingsSteps(t), [t]);
  useTour('user-settings', steps);
  const tabs = [
    { key: 'profile', label: t('profile', 'Profile') },
    { key: 'manual', label: t('user_manual', 'User manual') },
  ];
  const [active, setActive] = useState('manual');
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '1rem' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom:
                active === tab.key ? '2px solid #2563eb' : '2px solid transparent',
              background: 'none',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active === 'manual' && <UserManualTab />}
      {active === 'profile' && (
        <div>{t('profile_settings_placeholder', 'Profile settings coming soon.')}</div>
      )}
    </div>
  );
}

function UserManualTab() {
  const { t } = useTranslation();
  const [toursEnabled, setToursEnabled] = useState(() =>
    localStorage.getItem('settings_enable_tours') === 'true',
  );
  return (
    <div>
      <label>
        <input
          id="show-page-guide-toggle"
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
  );
}
