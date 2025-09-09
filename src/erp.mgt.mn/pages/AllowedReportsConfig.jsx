import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

export default function AllowedReportsConfig() {
  const { addToast } = useToast();
  useContext(AuthContext); // ensure auth context usage if needed
  const [reports, setReports] = useState({});
  const [proc, setProc] = useState('');
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [isDefault, setIsDefault] = useState(false);
  const [procOptions, setProcOptions] = useState([]);
  const [branchRows, setBranchRows] = useState([]);
  const [branchCfg, setBranchCfg] = useState({});
  const [deptRows, setDeptRows] = useState([]);
  const [deptCfg, setDeptCfg] = useState({});
  const [permRows, setPermRows] = useState([]);
  const [permCfg, setPermCfg] = useState({});

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

    fetch('/api/report_builder/procedure-files', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { names: [] }))
      .then((data) => setProcOptions(data.names || []))
      .catch(() => setProcOptions([]));

    fetch('/api/tables/code_branches?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setBranchRows(data.rows || []))
      .catch(() => setBranchRows([]));

    fetch('/api/display_fields?table=code_branches', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
      .then(setBranchCfg)
      .catch(() => setBranchCfg({ idField: null, displayFields: [] }));

    fetch('/api/tables/code_department?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setDeptRows(data.rows || []))
      .catch(() => setDeptRows([]));

    fetch('/api/display_fields?table=code_department', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
      .then(setDeptCfg)
      .catch(() => setDeptCfg({ idField: null, displayFields: [] }));

    fetch('/api/tables/user_levels?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setPermRows(data.rows || []))
      .catch(() => setPermRows([]));

    fetch('/api/display_fields?table=user_levels', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
      .then(setPermCfg)
      .catch(() => setPermCfg({ idField: null, displayFields: [] }));
  }, []);

  const branchOptions = useMemo(() => {
    const idField = branchCfg?.idField || 'id';
    return branchRows.map((b) => {
      const val = b[idField] ?? b.id;
      const label = branchCfg?.displayFields?.length
        ? branchCfg.displayFields
            .map((f) => b[f])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(b)
            .filter((v) => v !== undefined && v !== null)
            .join(' - ');
      return { value: String(val), label };
    });
  }, [branchRows, branchCfg]);

  const deptOptions = useMemo(() => {
    const idField = deptCfg?.idField || 'id';
    return deptRows.map((d) => {
      const val = d[idField] ?? d.id;
      const label = deptCfg?.displayFields?.length
        ? deptCfg.displayFields
            .map((f) => d[f])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(d)
            .filter((v) => v !== undefined && v !== null)
            .join(' - ');
      return { value: String(val), label };
    });
  }, [deptRows, deptCfg]);

  const permOptions = useMemo(() => {
    const idField = permCfg?.idField || 'id';
    return permRows.map((r) => {
      const val = r[idField] ?? r.id;
      const label = permCfg?.displayFields?.length
        ? permCfg.displayFields
            .map((f) => r[f])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(r)
            .filter((v) => v !== undefined && v !== null)
            .join(' - ');
      return { value: String(val), label };
    });
  }, [permRows, permCfg]);

  function edit(p) {
    const info = reports[p] || { branches: [], departments: [], permissions: [] };
    setProc(p);
    setBranches((info.branches || []).map(String));
    setDepartments((info.departments || []).map(String));
    setPermissions((info.permissions || []).map(String));
  }

  function handleNew() {
    setProc('');
    setBranches([]);
    setDepartments([]);
    setPermissions([]);
  }

  async function handleSave() {
    if (!proc) {
      addToast('Procedure is required', 'error');
      return;
    }
    try {
      const payload = {
        proc,
        branches: branches.map((v) => Number(v)).filter((v) => !Number.isNaN(v)),
        departments: departments.map((v) => Number(v)).filter((v) => !Number.isNaN(v)),
        permissions: permissions
          .map((v) => Number(v))
          .filter((v) => !Number.isNaN(v)),
      };
      const res = await fetch('/api/report_access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res
          .json()
          .then((d) => d.message)
          .catch(() => 'Failed to save');
        throw new Error(msg);
      }
      setReports((prev) => ({ ...prev, [proc]: payload }));
      addToast('Saved', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save', 'error');
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
                  <td>
                    {(info.permissions || [])
                      .map((perm) => {
                        const opt = permOptions.find(
                          (o) => o.value === String(perm),
                        );
                        return opt ? opt.label : perm;
                      })
                      .join(', ')}
                  </td>
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
          <button
            type="button"
            onClick={handleNew}
            style={{ marginTop: '0.5rem' }}
          >
            New
          </button>
        </div>
        <div>
          <div>
            <label>
              Procedure:{' '}
              <select value={proc} onChange={(e) => setProc(e.target.value)}>
                <option value="">-- Select --</option>
                {procOptions.filter((p) => !p.isDefault).length > 0 && (
                  <optgroup label="Tenant">
                    {procOptions
                      .filter((p) => !p.isDefault)
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                {procOptions.filter((p) => p.isDefault).length > 0 && (
                  <optgroup label="Default">
                    {procOptions
                      .filter((p) => p.isDefault)
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
          <div>
            <label>
              Branches:{' '}
              <select
                multiple
                size={8}
                value={branches}
                onChange={(e) =>
                  setBranches(Array.from(e.target.selectedOptions, (o) => o.value))
                }
              >
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setBranches(branchOptions.map((b) => b.value))}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setBranches([])}
              >
                None
              </button>
            </label>
          </div>
          <div>
            <label>
              Departments:{' '}
              <select
                multiple
                size={8}
                value={departments}
                onChange={(e) =>
                  setDepartments(
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
              >
                {deptOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setDepartments(deptOptions.map((d) => d.value))}
              >
                All
              </button>
              <button type="button" onClick={() => setDepartments([])}>
                None
              </button>
            </label>
          </div>
          <div>
            <label>
              Permissions:{' '}
              <select
                multiple
                size={8}
                value={permissions}
                onChange={(e) =>
                  setPermissions(
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
              >
                {permOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setPermissions(permOptions.map((p) => p.value))}
              >
                All
              </button>
              <button type="button" onClick={() => setPermissions([])}>
                None
              </button>
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
