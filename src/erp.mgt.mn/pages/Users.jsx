// src/erp.mgt.mn/pages/Users.jsx
import React, { useEffect, useState } from 'react';

export default function Users() {
  const [usersList, setUsersList] = useState([]);

  function loadUsers() {
    fetch('/api/users', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      })
      .then((json) => setUsersList(json))
      .catch((err) => console.error('Error fetching users:', err));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleAdd() {
    const empid = prompt('EmpID?');
    if (!empid) return;
    const email = prompt('Email?');
    const name = prompt('Name?');
    const password = prompt('Password?');
    const role = prompt('Role (user|admin)?', 'user');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ empid, email, name, password, role })
    });
    if (!res.ok) {
      alert('Failed to add user');
      return;
    }
    loadUsers();
  }

  async function handleEdit(u) {
    const email = prompt('Email?', u.email);
    const name = prompt('Name?', u.name);
    const role = prompt('Role?', u.role);
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, name, role })
    });
    if (!res.ok) {
      alert('Failed to update user');
      return;
    }
    loadUsers();
  }

  async function handleDelete(u) {
    if (!confirm('Delete user?')) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      alert('Failed to delete user');
      return;
    }
    loadUsers();
  }

  return (
    <div>
      <h2>Users</h2>
      <button onClick={handleAdd}>Add User</button>
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
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Actions
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
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  <button onClick={() => handleEdit(u)}>Edit</button>
                  <button onClick={() => handleDelete(u)} style={{ marginLeft: '0.5rem' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
