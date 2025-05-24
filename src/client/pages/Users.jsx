// src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const [allUsers, setAllUsers]     = useState([]);
  const [newUser, setNewUser]       = useState({ email: '', password: '', name: '', company: '', role: 'user' });
  const [myProfile, setMyProfile]   = useState({ name: '', company: '', password: '' });
  const [message, setMessage]       = useState('');

  // Fetch data on mount
  useEffect(() => {
    // Load my profile
    fetch('/erp/api/users/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setMyProfile({ name: data.name, company: data.company, password: '' }));

    // If admin, load all users
    if (isAdmin) {
      fetch('/erp/api/users', { credentials: 'include' })
        .then(r => r.json())
        .then(setAllUsers);
    }
  }, [isAdmin]);

  // Admin creates a new user
  const handleCreate = async e => {
    e.preventDefault();
    setMessage('');
    const res = await fetch('/erp/api/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    const json = await res.json();
    setMessage(json.message || 'User created');
    if (res.ok) {
      setAllUsers(u => [...u, { ...newUser, id: Date.now() }]);
      setNewUser({ email:'', password:'', name:'', company:'', role:'user' });
    }
  };

  // Update any user (admin) or self
  const handleUpdate = async (id, changes) => {
    setMessage('');
    const res = await fetch(`/erp/api/users/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes)
    });
    const json = await res.json();
    setMessage(json.message || 'Updated');
    if (isAdmin) {
      setAllUsers(u => u.map(x => x.id === id ? { ...x, ...changes } : x));
    } else if (id === user.id) {
      // update own profile
      setMyProfile(p => ({ ...p, ...changes }));
    }
  };

  // Admin deletes a user
  const handleDelete = async id => {
    if (!window.confirm('Delete this user?')) return;
    await fetch(`/erp/api/users/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    setAllUsers(u => u.filter(x => x.id !== id));
    setMessage('Deleted');
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: 'auto' }}>
      <h1>User Management</h1>
      {message && <p style={{ color: 'green' }}>{message}</p>}

      {isAdmin && (
        <>
          <section>
            <h2>Create New User</h2>
            <form onSubmit={handleCreate}>
              <input
                type="email" required placeholder="Email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                type="password" required placeholder="Password"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              />
              <input
                placeholder="Name"
                value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              />
              <input
                placeholder="Company"
                value={newUser.company}
                onChange={e => setNewUser({ ...newUser, company: e.target.value })}
              />
              <select
                value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit">Create</button>
            </form>
          </section>

          <section>
            <h2>All Users</h2>
            <table border={1} cellPadding={5} cellSpacing={0}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.email}</td>
                    <td>
                      <input
                        value={u.name}
                        onChange={e => handleUpdate(u.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={u.company}
                        onChange={e => handleUpdate(u.id, { company: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => handleUpdate(u.id, { role: e.target.value })}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      <button onClick={() => handleDelete(u.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <section>
        <h2>Your Profile</h2>
        <form onSubmit={e => { e.preventDefault(); handleUpdate(user.id, myProfile); }}>
          <label>
            Name:<br/>
            <input
              value={myProfile.name}
              onChange={e => setMyProfile({ ...myProfile, name: e.target.value })}
            />
          </label><br/>
          <label>
            Company:<br/>
            <input
              value={myProfile.company}
              onChange={e => setMyProfile({ ...myProfile, company: e.target.value })}
            />
          </label><br/>
          <label>
            New Password:<br/>
            <input
              type="password"
              placeholder="(leave blank to keep current)"
              value={myProfile.password}
              onChange={e => setMyProfile({ ...myProfile, password: e.target.value })}
            />
          </label><br/>
          <button type="submit">Update Profile</button>
        </form>
      </section>
    </div>
  );
}
