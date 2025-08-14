import { useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function refreshRolePermissions() {}

export function useRolePermissions() {
  const { company } = useContext(AuthContext);
  return useMemo(() => {
    if (!company) return null;
    const actions = company.permissions?.actions?.module_key || {};
    const map = {};
    for (const [key, perms] of Object.entries(actions)) {
      map[key] = perms.allowed ?? Object.values(perms).some(Boolean);
    }
    return map;
  }, [company]);
}
