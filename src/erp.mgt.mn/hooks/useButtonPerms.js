import { useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

const ALL_BUTTONS = new Proxy(
  {},
  {
    get: () => true,
    has: () => true,
  },
);

export default function useButtonPerms() {
  const { session, permissions } = useContext(AuthContext);
  return useMemo(() => {
    if (session?.permissions?.system_settings) return ALL_BUTTONS;
    return permissions?.buttons || {};
  }, [session?.permissions?.system_settings, permissions?.buttons]);
}

