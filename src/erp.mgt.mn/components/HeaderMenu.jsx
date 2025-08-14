import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useModules } from '../hooks/useModules.js';
import { useTxnModules } from '../hooks/useTxnModules.js';
import { useCompanyModules } from '../hooks/useCompanyModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';

export default function HeaderMenu({ onOpen }) {
  const { company, permissions: perms } = useContext(AuthContext);
  const modules = useModules();
  const txnModuleKeys = useTxnModules();
  const licensed = useCompanyModules(company);
  const generalConfig = useGeneralConfig();
  const items = modules.filter((r) => r.show_in_header);
  const headerMap = useHeaderMappings(items.map((m) => m.module_key));

  if (!perms || !licensed) return null;

  return (
    <nav style={styles.menu}>
      {items.map((m) => {
        const isTxn = txnModuleKeys && txnModuleKeys.has(m.module_key);
        if (!isTxn && !licensed[m.module_key]) return null;
        if (!isTxn && !perms[m.module_key]) return null;
        return (
          <button
            key={m.module_key}
            style={styles.btn}
            onClick={() => onOpen(m.module_key)}
          >
            {generalConfig.general?.procLabels?.[m.module_key] ||
              headerMap[m.module_key] ||
              m.label}
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
    marginRight: '0.75rem'
  }
};
