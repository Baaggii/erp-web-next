import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function UserProfile() {
  const { user, company } = useContext(AuthContext);
  if (!user) return null;
  return (
    <div>
      Logged in as: {user.full_name || user.empid}
      {user.full_name && ` (${user.empid})`}
      {company?.department_name && ` - ${company.department_name}`}
    </div>
  );
}
