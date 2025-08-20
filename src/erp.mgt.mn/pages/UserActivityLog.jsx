import React from 'react';
import TableManager from '../components/TableManager.jsx';

export default function UserActivityLogPage() {
  return (
    <div>
      <h2>User Activity Log</h2>
      <TableManager table="user_activity_log" initialPerPage={20} />
    </div>
  );
}
