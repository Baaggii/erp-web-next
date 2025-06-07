-- Translate module labels to Mongolian and add new modules
UPDATE modules SET label='Самбар' WHERE module_key='dashboard';
UPDATE modules SET label='Маягтууд' WHERE module_key='forms';
UPDATE modules SET label='Тайлан' WHERE module_key='reports';
UPDATE modules SET label='Тохиргоо' WHERE module_key='settings';
UPDATE modules SET label='Хэрэглэгчид' WHERE module_key='users';
UPDATE modules SET label='Хэрэглэгчийн компаниуд' WHERE module_key='user_companies';
UPDATE modules SET label='Эрхийн тохиргоо' WHERE module_key='role_permissions';
UPDATE modules SET label='Нууц үг солих' WHERE module_key='change_password';
UPDATE modules SET label='Ерөнхий журнал' WHERE module_key='gl';
UPDATE modules SET label='Худалдан авалтын захиалга' WHERE module_key='po';
UPDATE modules SET label='Борлуулалтын самбар' WHERE module_key='sales';
INSERT INTO modules (module_key, label) VALUES
  ('company_licenses','Лиценз'),
  ('tables_management','Хүснэгтийн удирдлага'),
  ('forms_management','Маягтын удирдлага'),
  ('report_management','Тайлангийн удирдлага')
ON DUPLICATE KEY UPDATE label=VALUES(label);
