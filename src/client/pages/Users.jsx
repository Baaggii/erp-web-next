// src/client/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Users() {
  const { user } = useAuth();
  const isAdmin  = user?.role === 'admin';

  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [message, setMessage]     = useState('');

  // Form state for creating a new user (admin only)
  const [newUser, setNewUser] = useState({
    empid: '', email: '', name: '', company: '', role: 'user', password: ''
  });

  // Form state for changing own password (everyone)
  const [pwdForm, setPwdForm] = useState({
    oldPassword: '', newPassword: '', confirmPassword: ''
  });

  // Load all users if admin
  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetch('/erp/api/users', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return res.json();
      })
      .then(list => setUsers(list))
      .catch(err => setMessage(err.message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  // CREATE
  const handleCreate = async e => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch('/erp/api/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Error ${res.status}`);
      // server should return { user: { id, empid, email, name, company, role } }
      setUsers(prev => [...prev, json.user]);
      setNewUser({ empid:'', email:'', name:'', company:'', role:'user', password:'' });
      setMessage('User created');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // ADMIN UPDATE
  const handleAdminUpdate = async (id, changes) => {
    setMessage('');
    try {
      const res = await fetch(`/erp/api/users/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Error ${res.status}`);
      setUsers(prev =>
        prev.map(u => (u.id === id ? { ...u, ...changes } : u))
      );
      setMessage(json.message || 'Updated');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // DELETE
  const handleDelete = async id => {
    if (!window.confirm('Delete this user?')) return;
    try {
      const res = await fetch(`/erp/api/users/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setUsers(prev => prev.filter(u => u.id !== id));
      setMessage('Deleted');
    } catch (err) {
      setMessage(err.message);
    }
  };

  // CHANGE OWN PASSWORD
  const handleChangePwd = async e => {
    e.preventDefault();
    setMessage('');
    const { oldPassword, newPassword, confirmPassword } = pwdForm;
    if (newPassword !== confirmPassword) {
      setMessage('New passwords do not match');
      return;
    }
    // at least 8 chars, upper, lower, digit, special
    const pwOK = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).{8,}$/.test(newPassword);
    if (!pwOK) {
      setMessage('Password must be 8+ chars with upper, lower, number & symbol');
      return;
    }
    try {
      const res = await fetch(`/erp/api/users/${user.id}/password`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || `Error ${res.status}`);
      setPwdForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password updated');
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (loading) {
    return <div style={{ padding: 20 }}>Loading users…</div>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: 'auto' }}>
      <h1>User Management</h1>
      {message && <p style={{ color: message.match(/error/i) ? 'red' : 'green' }}>{message}</p>}

      {isAdmin && (
        <>
          <section style={{ marginBottom: 40 }}>
            <h2>Create New User</h2>
            <form onSubmit={handleCreate} style={{ display: 'grid', gap: '8px', maxWidth: 400 }}>
              <input
                placeholder="EmpID"
                value={newUser.empid}
                onChange={e => setNewUser({ ...newUser, empid: e.target.value })}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                required
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

          <section style={{ marginBottom: 40 }}>
            <h2>All Users</h2>
            <table border={1} cellPadding={5} cellSpacing={0} style={{ width: '100%', textAlign: 'left' }}>
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
                        onChange={e => handleAdminUpdate(u.id, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={u.company}
                        onChange={e => handleAdminUpdate(u.id, { company: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => handleAdminUpdate(u.id, { role: e.target.value })}
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
        <h2>Change Your Password</h2>
        <form
          onSubmit={handleChangePwd}
          style={{ display: 'grid', gap: '8px', maxWidth: 400 }}
        >
          <input
            type="password"
            placeholder="Old Password"
            value={pwdForm.oldPassword}
            onChange={e => setPwdForm({ ...pwdForm, oldPassword: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="New Password"
            value={pwdForm.newPassword}
            onChange={e => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            value={pwdForm.confirmPassword}
            onChange={e => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
            required
          />
          <button type="submit">Update Password</button>
        </form>
      </section>
    </div>
  );
}
