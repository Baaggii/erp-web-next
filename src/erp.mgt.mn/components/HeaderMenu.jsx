import React, { useEffect, useState } from 'react';
import { useRolePermissions } from '../hooks/useRolePermissions.js';

export default function HeaderMenu({ onOpen }) {
  const perms = useRolePermissions();
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch('/api/modules', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        setItems(rows.filter((r) => r.show_in_header));
      })
      .catch(() => setItems([]));
  }, []);

  if (!perms) return null;

  return (
    <nav style={styles.menu}>
      {items.map(
        (m) =>
          perms[m.module_key] && (
            <button
              key={m.module_key}
              style={styles.btn}
              onClick={() => onOpen(m.module_key)}
            >
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
