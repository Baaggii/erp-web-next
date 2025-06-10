// src/erp.mgt.mn/pages/Users.jsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function Users() {
  const [usersList, setUsersList] = useState([]);
  const [filter, setFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [roles, setRoles] = useState([]);
  const { company } = useContext(AuthContext);

  function loadUsers() {
    const params = company ? `?companyId=${encodeURIComponent(company.company_id)}` : '';
    fetch(`/api/users${params}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      })
      .then((json) => setUsersList(json))
      .catch((err) => console.error('Error fetching users:', err));
  }

  useEffect(() => {
    loadUsers();
  }, [company]);

  useEffect(() => {
    fetch('/api/tables/user_roles?perPage=500', { credentials: 'include' })
      .then((res) => res.json())
      .then((json) => setRoles(json.rows || json))
      .catch((err) => console.error('Failed to fetch roles', err));
  }, []);

  function handleAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(u) {
    setEditing(u);
    setShowForm(true);
  }

  async function handleFormSubmit({ empid, email, name, password, roleId }) {
    const isEdit = Boolean(editing);
    const url = isEdit ? `/api/users/${editing.id}` : '/api/users';
    const method = isEdit ? 'PUT' : 'POST';
    const body = isEdit
      ? { email, name, roleId }
      : { empid, email, name, password, roleId };
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert(isEdit ? 'Failed to update user' : 'Failed to add user');
      return;
    }
    setShowForm(false);
    setEditing(null);
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
      <h2>Хэрэглэгчид</h2>
      <input
        type="text"
        placeholder="Хэрэглэгч шүүх"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleAdd}>Хэрэглэгч нэмэх</button>
      {usersList.length === 0 ? (
        <p>Хэрэглэгч олдсонгүй.</p>
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
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                ID
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Нэр
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Үүрэг
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Үйлдэл
              </th>
            </tr>
          </thead>
          <tbody>
            {usersList
              .filter(
                (u) =>
                  u.empid.toLowerCase().includes(filter.toLowerCase()) ||
                  u.name.toLowerCase().includes(filter.toLowerCase()) ||
                  (u.email || '').toLowerCase().includes(filter.toLowerCase())
              )
              .map((u) => (
              <tr key={u.id}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.empid}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.name}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.role}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  <button onClick={() => handleEdit(u)}>Засах</button>
                  <button onClick={() => handleDelete(u)} style={{ marginLeft: '0.5rem' }}>
                    Устгах
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <UserFormModal
        visible={showForm}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSubmit={handleFormSubmit}
        user={editing}
        roles={roles}
      />
    </div>
  );
}

function UserFormModal({ visible, onCancel, onSubmit, user, roles }) {
  const [empid, setEmpid] = useState(user?.empid || '');
  const [email, setEmail] = useState(user?.email || '');
  const [name, setName] = useState(user?.name || '');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(String(user?.role_id || 2));

  useEffect(() => {
    setEmpid(user?.empid || '');
    setEmail(user?.email || '');
    setName(user?.name || '');
    setPassword('');
    setRoleId(String(user?.role_id || 2));
  }, [user]);

  if (!visible) return null;

  const overlay = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const modal = {
    backgroundColor: '#fff',
    padding: '1rem',
    borderRadius: '4px',
    minWidth: '300px',
  };
  const isEdit = Boolean(user);

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Хэрэглэгч засах' : 'Хэрэглэгч нэмэх'}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ empid, email, name, password, roleId });
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>EmpID</label>
            <input
              type="text"
              value={empid}
              onChange={(e) => setEmpid(e.target.value)}
              disabled={isEdit}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Нэр</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          {!isEdit && (
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem' }}>Нууц үг</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ width: '100%', padding: '0.5rem' }}
              />
            </div>
          )}
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Үүрэг</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="" disabled>
                Сонгоно уу...
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: 'right' }}>
            <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
              Болих
            </button>
            <button type="submit">Хадгалах</button>
          </div>
        </form>
      </div>
    </div>
  );
}
