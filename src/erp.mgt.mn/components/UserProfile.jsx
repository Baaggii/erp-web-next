import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import I18nContext from '../context/I18nContext.jsx';

export default function UserProfile() {
  const { user, session } = useContext(AuthContext);
  const { t } = useContext(I18nContext);
  if (!user) return null;
  return (
    <div>
      {t('userProfile.loggedInAs', 'Logged in as')}: {session?.employee_name || user.empid}
      {session?.employee_name && ` (${user.empid})`}
      {session?.company_name && ` - ${session.company_name}`}
      {session?.department_name && ` - ${session.department_name}`}
      {session?.branch_name && ` - ${session.branch_name}`}
      {session?.user_level_name && ` - ${session.user_level_name}`}
    </div>
  );
}
