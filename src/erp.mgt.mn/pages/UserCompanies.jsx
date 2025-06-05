// src/erp.mgt.mn/pages/UserCompanies.jsx
import React, { useEffect, useState } from 'react';

export default function UserCompanies() {
  const [assignments, setAssignments] = useState([]);

  function loadAssignments() {
    fetch('/api/user_companies', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user_companies');
        return res.json();
      })
      .then(setAssignments)
      .catch(err => console.error('Error fetching user_companies:', err));
  }

  useEffect(() => {
    loadAssignments();
  }, []);

  async function handleAdd() {
    const empid = prompt('EmpID?');
    if (!empid) return;
    const companyId = prompt('Company ID?');
    if (!companyId) return;
    const role = prompt('Role (user|admin)?', 'user');
    const res = await fetch('/api/user_companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ empid, companyId, role })
    });
    if (!res.ok) {
      alert('Failed to add assignment');
      return;
    }
    loadAssignments();
  }

  async function handleEdit(a) {
    const role = prompt('Role', a.role);
    if (!role) return;
    const res = await fetch('/api/user_companies', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ empid: a.empid, companyId: a.company_id, role })
    });
    if (!res.ok) {
      alert('Failed to update assignment');
      return;
    }
    loadAssignments();
  }

  async function handleDelete(a) {
    if (!confirm('Delete assignment?')) return;
    const res = await fetch('/api/user_companies', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ empid: a.empid, companyId: a.company_id })
    });
    if (!res.ok) {
      alert('Failed to delete assignment');
      return;
    }
    loadAssignments();
  }

  return (
    <div>
      <h2>User Companies</h2>
      <button onClick={handleAdd}>Add Assignment</button>
      {assignments.length === 0 ? (
        <p>No assignments.</p>
      ) : (
        <table
          style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}
        >
          <thead>
            <tr style={{ backgroundColor: '#e5e7eb' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>User</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Company</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Role</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map(a => (
              <tr key={a.empid + '-' + a.company_id}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{a.empid}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{a.company_name}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{a.role}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>
                  <button onClick={() => handleEdit(a)}>Edit</button>
                  <button onClick={() => handleDelete(a)} style={{ marginLeft: '0.5rem' }}>
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
