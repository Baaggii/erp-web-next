import React, { useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { useModules } from '../hooks/useModules.js';
import { useTxnModules } from '../hooks/useTxnModules.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import modulePath from '../utils/modulePath.js';
import filterHeaderModules from '../utils/filterHeaderModules.js';
import { usePendingRequests } from '../context/PendingRequestContext.jsx';
import NotificationDots, { DEFAULT_NOTIFICATION_COLOR } from './NotificationDots.jsx';

export default function HeaderMenu({ onOpen }) {
  const { permissions: perms } = useContext(AuthContext);
  const modules = useModules();
  const txnModules = useTxnModules();
  const generalConfig = useGeneralConfig();
  const items = filterHeaderModules(modules, perms, txnModules);
  const headerMap = useHeaderMappings(items.map((m) => m.module_key));
  const { hasNew, anyHasNew, notificationColors, temporary } = usePendingRequests();

  const menuNotificationColors = useMemo(() => {
    if (notificationColors?.length) return notificationColors;
    if (anyHasNew || hasNew) return [DEFAULT_NOTIFICATION_COLOR];
    return [];
  }, [anyHasNew, hasNew, notificationColors]);

  // Build a quick lookup map so we can resolve module paths
  const moduleMap = {};
  modules.forEach((m) => {
    moduleMap[m.module_key] = m;
  });

  const badgeKeys = new Set();
  if (menuNotificationColors.length > 0 && moduleMap['requests']) {
    let cur = moduleMap['requests'];
    while (cur) {
      badgeKeys.add(cur.module_key);
      cur = cur.parent_key ? moduleMap[cur.parent_key] : null;
    }
  }
  if (temporary?.hasNew && moduleMap['forms']) {
    let cur = moduleMap['forms'];
    while (cur) {
      badgeKeys.add(cur.module_key);
      cur = cur.parent_key ? moduleMap[cur.parent_key] : null;
    }
  }

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
            {badgeKeys.has(m.module_key) && (
              <NotificationDots
                colors={menuNotificationColors}
                size="0.45rem"
                gap="0.15rem"
                marginRight="0.35rem"
              />
            )}
            {label}
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
  }
};
