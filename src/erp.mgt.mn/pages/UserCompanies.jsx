// src/erp.mgt.mn/pages/UserCompanies.jsx
import React, { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

export default function UserCompanies() {
  const [assignments, setAssignments] = useState([]);
  const [filterEmpId, setFilterEmpId] = useState('');
  const { company } = useContext(AuthContext);
  const [usersList, setUsersList] = useState([]);
  const [companiesList, setCompaniesList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  function loadAssignments(empid) {
    const params = [];
    if (empid) params.push(`empid=${encodeURIComponent(empid)}`);
    if (company) params.push(`companyId=${encodeURIComponent(company.company_id)}`);
    const url = params.length ? `/api/user_companies?${params.join('&')}` : '/api/user_companies';
    fetch(url, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch user_companies');
        return res.json();
      })
      .then(setAssignments)
      .catch(err => console.error('Error fetching user_companies:', err));
  }

  useEffect(() => {
    loadAssignments();
  }, [company]);

  useEffect(() => {
    async function loadLists() {
      try {
        const [uRes, cRes] = await Promise.all([
          fetch('/api/users', { credentials: 'include' }),
          fetch('/api/companies', { credentials: 'include' })
        ]);
        const users = uRes.ok ? await uRes.json() : [];
        const companies = cRes.ok ? await cRes.json() : [];
        setUsersList(users);
        setCompaniesList(companies);
      } catch (err) {
        console.error('Error loading lists:', err);
      }
    }
    loadLists();
  }, []);

  function handleFilter() {
    loadAssignments(filterEmpId);
  }

  function handleAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function handleEdit(a) {
    setEditing(a);
    setShowForm(true);
  }

  async function handleFormSubmit({ empid, companyId, roleId }) {
    const isEdit = Boolean(editing);
    const res = await fetch('/api/user_companies', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ empid, companyId, roleId })
    });
    if (!res.ok) {
      const { message } = await res
        .json()
        .catch(() => ({ message: isEdit ? 'Failed to update assignment' : 'Failed to add assignment' }));
      alert(message || (isEdit ? 'Failed to update assignment' : 'Failed to add assignment'));
      return;
    }
    setShowForm(false);
    setEditing(null);
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
      const { message } = await res.json().catch(() => ({ message: 'Failed to delete assignment' }));
      alert(message || 'Failed to delete assignment');
      return;
    }
    loadAssignments();
  }

  return (
    <div>
      <h2>User Companies</h2>
      <input
        type="text"
        placeholder="Filter by EmpID"
        value={filterEmpId}
        onChange={(e) => setFilterEmpId(e.target.value)}
        style={{ marginRight: '0.5rem' }}
      />
      <button onClick={handleFilter} style={{ marginRight: '0.5rem' }}>
        Apply
      </button>
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
      <AssignmentFormModal
        visible={showForm}
        onCancel={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSubmit={handleFormSubmit}
        assignment={editing}
        users={usersList}
        companies={companiesList}
      />
    </div>
  );
}

function AssignmentFormModal({ visible, onCancel, onSubmit, assignment, users, companies }) {
  const [empid, setEmpid] = useState(assignment?.empid || '');
  const [companyId, setCompanyId] = useState(assignment?.company_id || '');
  const [roleId, setRoleId] = useState(String(assignment?.role_id || 2));

  useEffect(() => {
    setEmpid(assignment?.empid || '');
    setCompanyId(assignment?.company_id || '');
    setRoleId(String(assignment?.role_id || 2));
  }, [assignment]);

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
    justifyContent: 'center'
  };

  const modal = {
    backgroundColor: '#fff',
    padding: '1rem',
    borderRadius: '4px',
    minWidth: '300px'
  };

  const isEdit = Boolean(assignment);

  return (
    <div style={overlay}>
      <div style={modal}>
        <h3 style={{ marginTop: 0 }}>{isEdit ? 'Edit Assignment' : 'Add Assignment'}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({ empid, companyId, roleId });
          }}
        >
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>EmpID</label>
            <select
              value={empid}
              onChange={(e) => setEmpid(e.target.value)}
              disabled={isEdit}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="" disabled>
                Choose...
              </option>
              {users.map((u) => (
                <option key={u.empid} value={u.empid}>
                  {u.empid} - {u.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Company</label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={isEdit}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="" disabled>
                Choose...
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            >
              <option value="1">admin</option>
              <option value="2">user</option>
            </select>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
