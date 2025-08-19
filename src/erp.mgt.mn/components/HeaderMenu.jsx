import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useModules } from '../hooks/useModules.js';
import { useTxnModules } from '../hooks/useTxnModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import usePendingRequestCount from '../hooks/usePendingRequestCount.js';
import modulePath from '../utils/modulePath.js';
import filterHeaderModules from '../utils/filterHeaderModules.js';

export default function HeaderMenu({ onOpen }) {
  const { permissions: perms, user } = useContext(AuthContext);
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();
  const items = filterHeaderModules(modules, perms, txnModules);
  const headerMap = useHeaderMappings(items.map((m) => m.module_key));
  const pendingCount = usePendingRequestCount(user?.empid);

  // Build a quick lookup map so we can resolve module paths
  const moduleMap = {};
  modules.forEach((m) => {
    moduleMap[m.module_key] = m;
  });

  if (!perms) return null;

  return (
    <nav style={styles.menu}>
      {items.map((m) => {
        const label =
          generalConfig.general?.procLabels?.[m.module_key] ||
          headerMap[m.module_key] ||
          m.label;

        return (
          <button
            key={m.module_key}
            style={styles.btn}
            onClick={() =>
              onOpen(modulePath(m, moduleMap), label, m.module_key)
            }
          >
            {label}
            {m.module_key === 'dashboard' && pendingCount > 0 && (
              <span style={styles.badge}>{pendingCount}</span>
            )}
          </button>
        );
      })}
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
    marginRight: '0.75rem',
    position: 'relative'
  },
  badge: {
    background: 'red',
    borderRadius: '50%',
    color: '#fff',
    fontSize: '0.7rem',
    marginLeft: '4px',
    padding: '0 6px'
  }
};
