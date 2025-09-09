import React, { useEffect, useState, useContext } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

export default function AllowedReportsConfig() {
  const { addToast } = useToast();
  useContext(AuthContext); // ensure auth context usage if needed
  const [reports, setReports] = useState({});
  const [proc, setProc] = useState('');
  const [branches, setBranches] = useState('');
  const [departments, setDepartments] = useState('');
  const [permissions, setPermissions] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    fetch('/api/report_access', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { allowedReports: {}, isDefault: true },
      )
      .then((data) => {
        setReports(data.allowedReports || {});
        setIsDefault(!!data.isDefault);
      })
      .catch(() => {
        setReports({});
        setIsDefault(true);
      });
  }, []);

  function edit(p) {
    const info = reports[p] || { branches: [], departments: [], permissions: [] };
    setProc(p);
    setBranches(info.branches.join(','));
    setDepartments(info.departments.join(','));
    setPermissions(info.permissions.join(','));
  }

  function handleNew() {
    setProc('');
    setBranches('');
    setDepartments('');
    setPermissions('');
  }

  async function handleSave() {
    try {
      const payload = {
        proc,
        branches: branches
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '')
          .map(Number)
          .filter((v) => !Number.isNaN(v)),
        departments: departments
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '')
          .map(Number)
          .filter((v) => !Number.isNaN(v)),
        permissions: permissions
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== ''),
      };
      const res = await fetch('/api/report_access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('failed');
      setReports((prev) => ({ ...prev, [proc]: payload }));
      addToast('Saved', 'success');
    } catch {
      addToast('Failed to save', 'error');
    }
  }

  async function handleDelete(p) {
    if (!window.confirm('Delete configuration?')) return;
    try {
      const params = new URLSearchParams({ proc: p });
      const res = await fetch(`/api/report_access?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('failed');
      setReports((prev) => {
        const copy = { ...prev };
        delete copy[p];
        return copy;
      });
      if (proc === p) handleNew();
      addToast('Deleted', 'success');
    } catch {
      addToast('Failed to delete', 'error');
    }
  }

  return (
    <div>
      <h2>Allowed Reports</h2>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <div>
          <table>
            <thead>
              <tr>
                <th>Procedure</th>
                <th>Branches</th>
                <th>Departments</th>
                <th>Permissions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(reports).map(([p, info]) => (
                <tr key={p}>
                  <td>{p}</td>
                  <td>{(info.branches || []).join(', ')}</td>
                  <td>{(info.departments || []).join(', ')}</td>
                  <td>{(info.permissions || []).join(', ')}</td>
                  <td>
                    <button onClick={() => edit(p)}>Edit</button>
                    <button
                      onClick={() => handleDelete(p)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleNew} style={{ marginTop: '0.5rem' }}>
            New
          </button>
        </div>
        <div>
          <div>
            <label>
              Procedure:
              <input value={proc} onChange={(e) => setProc(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Branches:
              <input
                value={branches}
                onChange={(e) => setBranches(e.target.value)}
                placeholder="comma separated"
              />
            </label>
          </div>
          <div>
            <label>
              Departments:
              <input
                value={departments}
                onChange={(e) => setDepartments(e.target.value)}
                placeholder="comma separated"
              />
            </label>
          </div>
          <div>
            <label>
              Permissions:
              <input
                value={permissions}
                onChange={(e) => setPermissions(e.target.value)}
                placeholder="comma separated"
              />
            </label>
          </div>
          <button onClick={handleSave} style={{ marginTop: '0.5rem' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
