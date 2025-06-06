import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function useRolePermissions() {
  const { user } = useContext(AuthContext);
  const [perms, setPerms] = useState({});

  useEffect(() => {
    if (!user) {
      setPerms({});
      return;
    }
    const roleId = user.role_id || (user.role === 'admin' ? 1 : 2);
    fetch(`/api/role_permissions?roleId=${roleId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        const map = {};
        rows.forEach((r) => {
          map[r.module_key] = !!r.allowed;
        });
        setPerms(map);
      })
      .catch((err) => console.error('Failed to load permissions', err));
  }, [user]);

  return perms;
}
