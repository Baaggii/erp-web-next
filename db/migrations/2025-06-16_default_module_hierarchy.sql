-- Set default parent_key and display flags for existing modules
UPDATE modules SET parent_key=NULL, show_in_sidebar=1, show_in_header=0
  WHERE module_key IN ('dashboard','forms','reports','settings');

UPDATE modules SET parent_key='settings', show_in_sidebar=1, show_in_header=0
  WHERE module_key IN (
    'users','user_companies','role_permissions','company_licenses',
    'tables_management','forms_management','report_management','change_password'
  );

UPDATE modules SET parent_key=NULL, show_in_sidebar=0, show_in_header=1
  WHERE module_key IN ('gl','po','sales');
