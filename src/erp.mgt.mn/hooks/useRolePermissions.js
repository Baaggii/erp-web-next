import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

let cached = null;

export function useRolePermissions() {
  const { user } = useContext(AuthContext);
  const [perms, setPerms] = useState(cached || {});

  useEffect(() => {
    if (!user) return;
    if (cached) return;
    const roleId = user.role_id || (user.role === 'admin' ? 1 : 2);
    fetch(`/api/role_permissions?roleId=${roleId}`, { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then(rows => {
        const map = {};
        rows.forEach(r => { map[r.module_key] = !!r.allowed; });
        cached = map;
        setPerms(map);
      })
      .catch(err => console.error('Failed to load permissions', err));
  }, [user]);

  return perms;
}
