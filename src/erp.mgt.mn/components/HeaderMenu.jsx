import React from 'react';
import { useRolePermissions } from '../hooks/useRolePermissions.js';

export default function HeaderMenu({ onOpen }) {
  const perms = useRolePermissions();
  return (
    <nav style={styles.menu}>
      {perms.gl !== false && (
        <button style={styles.btn} onClick={() => onOpen('gl')}>
          General Ledger
        </button>
      )}
      {perms.po !== false && (
        <button style={styles.btn} onClick={() => onOpen('po')}>
          Purchase Orders
        </button>
      )}
      {perms.sales !== false && (
        <button style={styles.btn} onClick={() => onOpen('sales')}>
          Sales Dashboard
        </button>
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
