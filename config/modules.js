export const modules = [
  { key: 'dashboard', name: 'Blue Link Demo', path: '/' },
  { key: 'forms', name: 'Forms', path: '/forms' },
  { key: 'reports', name: 'Reports', path: '/reports' },
  { key: 'settings', name: 'Settings', path: '/settings' },
  { key: 'users', name: 'Users', path: '/settings/users', parent: 'settings' },
  { key: 'user_companies', name: 'User Companies', path: '/settings/user-companies', parent: 'settings' },
  { key: 'role_permissions', name: 'Role Permissions', path: '/settings/role-permissions', parent: 'settings' },
  { key: 'change_password', name: 'Change Password', path: '/settings/change-password', parent: 'settings' },
];
