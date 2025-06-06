import React from 'react';
import { useRolePermissions } from '../hooks/useRolePermissions.js';

export default function HeaderMenu({ onOpen }) {
  const perms = useRolePermissions();
  const items = [
    { id: 'gl', label: 'General Ledger' },
    { id: 'po', label: 'Purchase Orders' },
    { id: 'sales', label: 'Sales Dashboard' },
  ];
  return (
    <nav style={styles.menu}>
      {items.map(
        (m) =>
          perms[m.id] && (
            <button key={m.id} style={styles.btn} onClick={() => onOpen(m.id)}>
              {m.label}
            </button>
          ),
      )}
    </nav>
  );
}

const styles = {
  menu: { marginLeft: '2rem', flexGrow: 1 },
  btn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginRight: '0.75rem'
  }
};
