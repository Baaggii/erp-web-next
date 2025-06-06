import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// Cache permissions by role so switching users does not refetch unnecessarily
const cache = {};

// Simple event emitter for permission refresh events
const emitter = new EventTarget();

export function refreshRolePermissions(roleId) {
  if (roleId) delete cache[roleId];
  emitter.dispatchEvent(new Event('refresh'));
}

export function useRolePermissions() {
  const { user } = useContext(AuthContext);
  const [perms, setPerms] = useState(null);

  async function fetchPerms(roleId) {
    try {
      const res = await fetch(`/api/role_permissions?roleId=${roleId}`, {
        credentials: 'include',
      });
      const rows = res.ok ? await res.json() : [];
      const map = {};
      rows.forEach((r) => {
        map[r.module_key] = !!r.allowed;
      });
      cache[roleId] = map;
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
    const roleId = user.role_id || (user.role === 'admin' ? 1 : 2);

    if (cache[roleId]) {
      setPerms(cache[roleId]);
    } else {
      fetchPerms(roleId);
    }
  }, [user]);

  // Listen for refresh events
  useEffect(() => {
    if (!user) return;
    const roleId = user.role_id || (user.role === 'admin' ? 1 : 2);
    const handler = () => fetchPerms(roleId);
    emitter.addEventListener('refresh', handler);
    return () => emitter.removeEventListener('refresh', handler);
  }, [user]);

  return perms;
}
