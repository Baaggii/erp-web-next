import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

// Simple helper to read permissions from AuthContext.
export function useRolePermissions() {
  const { permissions } = useContext(AuthContext);
  return permissions;
}
