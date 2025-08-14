import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function UserProfile() {
  const { user, session } = useContext(AuthContext);
  if (!user) return null;
  return (
    <div>
      Logged in as: {session?.employee_name || user.empid}
      {session?.employee_name && ` (${user.empid})`}
      {session?.company_name && ` - ${session.company_name}`}
      {session?.branch_name && ` - ${session.branch_name}`}
      {session?.department_name && ` - ${session.department_name}`}
    </div>
  );
}
