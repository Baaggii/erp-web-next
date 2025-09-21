import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';

export default function UserProfile() {
  const { user, session } = useContext(AuthContext);
  const { t } = useContext(I18nContext);

  const loggedInAs = t('userProfile.loggedInAs', 'Logged in as:');
  const employeeIdPrefix = t('userProfile.employeeIdPrefix', ' (');
  const employeeIdSuffix = t('userProfile.employeeIdSuffix', ')');
  const detailSeparator = t('userProfile.detailSeparator', ' - ');

  if (!user) return null;
  return (
    <div>
      {loggedInAs}{' '}
      {session?.employee_name || user.empid}
      {session?.employee_name && (
        <>
          {employeeIdPrefix}
          {user.empid}
          {employeeIdSuffix}
        </>
      )}
      {session?.company_name && (
        <>
          {detailSeparator}
          {session.company_name}
        </>
      )}
      {session?.department_name && (
        <>
          {detailSeparator}
          {session.department_name}
        </>
      )}
      {session?.branch_name && (
        <>
          {detailSeparator}
          {session.branch_name}
        </>
      )}
      {session?.user_level_name && (
        <>
          {detailSeparator}
          {session.user_level_name}
        </>
      )}
    </div>
  );
}
