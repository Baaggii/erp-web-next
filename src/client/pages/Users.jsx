// File: src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  const [list, setList] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', name: '', company: '', role: 'user' });
  const [profile, setProfile] = useState({ name: '', company: '', password: '' });
  const [msg, setMsg] = useState('');

  // Load users if admin
  useEffect(() => {
    if (isAdmin) {
      fetch('/erp/api/users', { credentials: 'include' })
        .then(r => r.json())
        .then(setList);
    }
    // load current profile
    fetch('/erp/api/users/me', { credentials: 'include' })
      .then(r => r.json())
      .then(u => setProfile({ name: u.name, company: u.company, password: '' }));
  }, [isAdmin]);

  // Admin: create new user
  const createUser = async e => {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/erp/api/users', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    const json = await res.json();
    setMsg(json.message || 'Done');
    setList(prev => [...prev, { ...form, id: Date.now() }]);
  };

  // PUT handler (shared)
  const updateUser = async (id, data) => {
    const res = await fetch(`/erp/api/users/${id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    setMsg(json.message || 'Updated');
    if (isAdmin) {
      setList(prev =>
        prev.map(u => (u.id === id ? { ...u, ...data } : u))
      );
    }
  };

  // Admin: delete a user
  const deleteUser = async id => {
    if (!window.confirm('Delete this user?')) return;
    await fetch(`/erp/api/users/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    setList(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>User Management</h1>
      {msg && <p style={{ color: 'green' }}>{msg}</p>}

      {isAdmin && (
        <>
          <h2>Create New User</h2>
          <form onSubmit={createUser}>
            <input
              type="email"
              required
              placeholder="Email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
            <input
              placeholder="Name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="Company"
              value={form.company}
              onChange={e => setForm({ ...form, company: e.target.value })}
            />
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit">Create</button>
          </form>

          <h2>All Users</h2>
          <table border={1} cellPadding={5}>
            <thead>
              <tr>
                <th>ID</th><th>Email</th><th>Name</th><th>Company</th><th>Role</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.email}</td>
                  <td>
                    <input
                      value={u.name}
                      onChange={e => updateUser(u.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={u.company}
                      onChange={e => updateUser(u.id, { company: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={u.role}
                      onChange={e => updateUser(u.id, { role: e.target.value })}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => deleteUser(u.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2>Your Profile</h2>
      <form onSubmit={e => { e.preventDefault(); updateUser(user.id, profile); }}>
        <label>
          Name:<br/>
          <input
            value={profile.name}
            onChange={e => setProfile({ ...profile, name: e.target.value })}
          />
        </label><br/>
        <label>
          Company:<br/>
          <input
            value={profile.company}
            onChange={e => setProfile({ ...profile, company: e.target.value })}
          />
        </label><br/>
        <label>
          New Password:<br/>
          <input
            type="password"
            placeholder="Leave blank to keep"
            value={profile.password}
            onChange={e => setProfile({ ...profile, password: e.target.value })}
          />
        </label><br/>
        <button type="submit">Update Profile</button>
      </form>
    </div>
  );
}
