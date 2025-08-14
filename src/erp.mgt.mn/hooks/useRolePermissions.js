import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export function refreshRolePermissions() {}

export function useRolePermissions() {
  const { permissions } = useContext(AuthContext);
  return permissions?.actions?.module_key || {};
}
