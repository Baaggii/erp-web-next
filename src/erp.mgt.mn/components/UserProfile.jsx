import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function UserProfile() {
  const { user, company } = useContext(AuthContext);
  if (!user) return null;
  return (
    <div>
      Logged in as: {company?.employee_name || user.empid}
      {company?.employee_name && ` (${user.empid})`}
      {company?.company_name && ` - ${company.company_name}`}
      {company?.branch_name && ` - ${company.branch_name}`}
      {company?.department_name && ` - ${company.department_name}`}
    </div>
  );
}
