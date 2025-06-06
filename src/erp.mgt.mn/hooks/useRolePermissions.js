import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// Cache permissions by role/company so switching users does not refetch unnecessarily
const cache = {};

// Simple event emitter for permission refresh events
const emitter = new EventTarget();

export function refreshRolePermissions(roleId, companyId) {
  if (roleId && companyId) delete cache[`${companyId}-${roleId}`];
  emitter.dispatchEvent(new Event('refresh'));
}

export function useRolePermissions() {
  const { user, company } = useContext(AuthContext);
  const [perms, setPerms] = useState(null);

  async function fetchPerms(roleId, companyId) {
    try {
      const params = new URLSearchParams();
      if (roleId) params.append('roleId', roleId);
      if (companyId) params.append('companyId', companyId);
      const res = await fetch(`/api/role_permissions?${params.toString()}`, {
        credentials: 'include',
      });
      const rows = res.ok ? await res.json() : [];
      const map = {};
      rows.forEach((r) => {
        map[r.module_key] = !!r.allowed;
      });
      cache[`${companyId}-${roleId}`] = map;
      setPerms(map);
    } catch (err) {
      console.error('Failed to load permissions', err);
      setPerms({});
    }
  }

  useEffect(() => {
    if (!user) {
      setPerms(null);
      return;
    }
    const roleId =
      company?.role_id || user.role_id || (user.role === 'admin' ? 1 : 2);
    const companyId = company?.company_id;

    const key = `${companyId}-${roleId}`;
    if (cache[key]) {
      setPerms(cache[key]);
    } else {
      fetchPerms(roleId, companyId);
    }
  }, [user, company]);

  // Listen for refresh events
  useEffect(() => {
    if (!user) return;
    const roleId =
      company?.role_id || user.role_id || (user.role === 'admin' ? 1 : 2);
    const companyId = company?.company_id;
    const handler = () => fetchPerms(roleId, companyId);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [user, company]);

  return perms;
}
