import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';

export default function UserMenu({ user, onLogout, onResetGuide, details = [] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { session } = useContext(AuthContext);
  const { t } = useContext(I18nContext);

  if (!user) return null;

  function toggle() {
    setOpen((o) => !o);
  }

  function handleChangePassword() {
    setOpen(false);
    navigate('/settings/change-password');
  }

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <div style={styles.wrapper}>
      <button style={styles.userBtn} onClick={toggle}>
        {session?.employee_name || user.empid} ▾
      </button>
      {open && (
        <div style={styles.menu}>
          {details.length > 0 && (
            <div style={styles.detailSection}>
              <div style={styles.detailTitle}>
                {t('userMenu.aboutYou', 'Your account')}
              </div>
              <ul style={styles.detailList}>
                {details.map((item) => (
                  <li key={`${item.label}-${item.value}`} style={styles.detailItem}>
                    {item.icon && <span style={styles.detailIcon}>{item.icon}</span>}
                    <div style={styles.detailText}>
                      <span style={styles.detailLabel}>{item.label}</span>
                      <span style={styles.detailValue}>{item.value}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button style={styles.menuItem} onClick={handleChangePassword}>
            {t('userMenu.changePassword', 'Нууц үг солих')}
          </button>
          <button
            style={styles.menuItem}
            onClick={() => {
              setOpen(false);
              onResetGuide && onResetGuide();
            }}
          >
            {t('userMenu.showPageGuide', 'Show page guide')}
          </button>
          <button style={styles.menuItem} onClick={handleLogout}>
            {t('userMenu.logout', 'Гарах')}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: { position: 'relative', display: 'inline-block' },
  userBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  menu: {
    position: 'absolute',
    right: 0,
    top: '100%',
    background: '#ffffff',
    border: '1px solid #d1d5db',
    borderRadius: '3px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    minWidth: '220px',
    padding: '0.25rem 0',
    zIndex: 10,
  },
  detailSection: {
    padding: '0.5rem 0.5rem 0.25rem 0.5rem',
    borderBottom: '1px solid #e5e7eb',
  },
  detailTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '0.25rem',
  },
  detailList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  detailItem: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '0.35rem',
    alignItems: 'start',
    color: '#1f2937',
  },
  detailIcon: {
    opacity: 0.8,
  },
  detailText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
    minWidth: 0,
  },
  detailLabel: {
    fontSize: '0.75rem',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  },
  detailValue: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111827',
    wordBreak: 'break-word',
  },
  menuItem: {
    display: 'block',
    width: '100%',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    padding: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.9rem',
    color: '#1f2937',
  },
};
