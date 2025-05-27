// src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth }                    from '../context/AuthContext.jsx';

export default function Users() {
  const { user }       = useAuth();
  const isAdmin        = user?.role === 'admin';
  const [users, setUsers]           = useState(null);
  const [newUser, setNewUser]       = useState({
    empid:'', email:'', password:'', name:'', company:'', role:'user'
  });
  const [profilePwd, setProfilePwd] = useState({
    oldPassword:'', newPassword:'', confirmPassword:''
  });
  const [message, setMessage]       = useState('');

  // Load all users if admin
  useEffect(() => {
    if (!isAdmin) return;
    setUsers([]); // start loading
    fetch('api/users', { credentials:'include' })
      .then(r => {
        if (!r.ok) throw new Error(`Status ${r.status}`);
        return r.json();
      })
      .then(list => setUsers(list))
      .catch(err => {
        console.error(err);
        setMessage(err.message);
        setUsers([]);
      });
  }, [isAdmin]);

  // Show loading / forbidden states
  if (!isAdmin) {
    return <div style={{ padding:20 }}>Only admins can view this page.</div>;
  }
  if (users === null) {
    return <div style={{ padding:20 }}>Loading users…</div>;
  }

  // Handlers omitted for brevity; assume they all use `fetch('api/users…')`
  // and call setUsers/update state as before.

  return (
    <div style={{ padding:20, maxWidth:800, margin:'auto' }}>
      <h1>User Management</h1>
      {message && <p style={{ color:'green' }}>{message}</p>}

      {/* …Create form (POST to 'api/users')… */}

      <section style={{ marginTop:40 }}>
        <h2>All Users</h2>
        <table border={1} cellPadding={5} cellSpacing={0}>
          <thead>
            <tr>
              <th>ID</th><th>EmpID</th><th>Email</th><th>Name</th>
              <th>Company</th><th>Role</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.empid}</td>
                <td>{u.email}</td>
                <td>
                  <input
                    value={u.name}
                    onChange={e => {/* PUT to `api/users/${u.id}` then update state */}}
                  />
                </td>
                <td>
                  <input
                    value={u.company}
                    onChange={e => {/* PUT … */}}
                  />
                </td>
                <td>
                  <select
                    value={u.role}
                    onChange={e => {/* PUT … */}}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <button onClick={()=>{/* DELETE `api/users/${u.id}` then update */}}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* …“Your Profile” section, same as before… */}
    </div>
  );
}
