// src/erp.mgt.mn/pages/Users.jsx
import React, { useEffect, useState } from 'react';

export default function Users() {
  const [usersList, setUsersList] = useState([]);

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      })
      .then((json) => setUsersList(json))
      .catch((err) => console.error('Error fetching users:', err));
  }, []);

  return (
    <div>
      <h2>Users</h2>
      {usersList.length === 0 ? (
        <p>No users returned.</p>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginTop: '0.5rem',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>ID</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                EmpID
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Email
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Name
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {usersList.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{u.id}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.empid}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.email}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.name}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.role}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
