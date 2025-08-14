import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useModules } from '../hooks/useModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';

export default function HeaderMenu({ onOpen }) {
  const { permissions: perms } = useContext(AuthContext);
  const modules = useModules();
  const generalConfig = useGeneralConfig();
  const items = modules.filter((r) => r.show_in_header);
  const headerMap = useHeaderMappings(items.map((m) => m.module_key));

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
              {generalConfig.general?.procLabels?.[m.module_key] ||
                headerMap[m.module_key] ||
                m.label}
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
