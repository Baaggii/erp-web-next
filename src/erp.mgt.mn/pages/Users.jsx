// src/erp.mgt.mn/pages/Users.jsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { debugLog } from '../utils/debug.js';

export default function Users() {
  const [usersList, setUsersList] = useState([]);
  const [filter, setFilter] = useState('');
  const { company } = useContext(AuthContext);

  useEffect(() => {
    debugLog('Component mounted: Users');
  }, []);

  function loadUsers() {
    const params = company ? `?companyId=${encodeURIComponent(company)}` : '';
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

  async function handleAdd() {
    const empid = prompt('EmpID?');
    if (!empid) return;
    const password = prompt('Password?');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ empid, password })
    });
    if (!res.ok) {
      let message = 'Failed to add user';
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore json errors
      }
      alert(message);
      return;
    }
    loadUsers();
  }

  async function handleEdit(u) {
    alert('Editing users is not supported');
  }

  async function handleDelete(u) {
    if (!confirm('Delete user?')) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      let message = 'Failed to delete user';
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore json errors
      }
      alert(message);
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
        <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
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
                Албан тушаал
              </th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                Үйлдэл
              </th>
            </tr>
          </thead>
          <tbody>
            {usersList
              .filter((u) =>
                u.empid.toLowerCase().includes(filter.toLowerCase())
              )
              .map((u) => (
              <tr key={u.id}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.empid != null ? u.empid : ''}
                </td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  {u.position != null ? u.position : ''}
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
        </div>
      )}
    </div>
  );
}
