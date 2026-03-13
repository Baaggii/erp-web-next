import { useContext, useMemo } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function usePermission(permissionKey) {
  const { permissions } = useContext(AuthContext);

  return useMemo(() => {
    if (!permissionKey) return false;
    if (!permissions || typeof permissions !== 'object') return false;

    const value = permissions[permissionKey];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'allowed'].includes(value.toLowerCase());
    }
    return Boolean(value);
  }, [permissionKey, permissions]);
}
