import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// Cache permissions by role so switching users does not refetch unnecessarily
const cache = {};

export function useRolePermissions() {
  const { user } = useContext(AuthContext);
  const [perms, setPerms] = useState(null);

  useEffect(() => {
    if (!user) {
      setPerms(null);
      return;
    }
    const roleId = user.role_id || (user.role === 'admin' ? 1 : 2);

    if (cache[roleId]) {
      setPerms(cache[roleId]);
      return;
    }

    fetch(`/api/role_permissions?roleId=${roleId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const map = {};
        rows.forEach((r) => {
          map[r.module_key] = !!r.allowed;
        });
        cache[roleId] = map;
        setPerms(map);
      })
      .catch((err) => {
        console.error('Failed to load permissions', err);
        setPerms({});
      });
  }, [user]);

  return perms;
}
