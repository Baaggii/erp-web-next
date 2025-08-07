import React from 'react';
import { useRolePermissions } from '../hooks/useRolePermissions.js';
import { useModules } from '../hooks/useModules.js';
import useProcLabels from '../hooks/useProcLabels.js';

export default function HeaderMenu({ onOpen }) {
  const perms = useRolePermissions();
  const modules = useModules();
  const items = modules.filter((r) => r.show_in_header);
  const procLabelMap = useProcLabels(items.map((m) => m.module_key));

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
              {procLabelMap[m.module_key] || m.label}
            </button>
          ),
      )}
    </nav>
  );
}

const styles = {
  menu: { marginLeft: '2rem', flexGrow: 1, position: 'relative', zIndex: 30 },
  btn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginRight: '0.75rem'
  }
};
