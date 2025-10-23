import React, { useEffect, useState, useContext, useMemo, useCallback } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { refreshModules } from '../hooks/useModules.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';

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
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/report_access', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { allowedReports: {}, isDefault: true },
      )
      .then((data) => {
        setReports(data.allowedReports || {});
        setIsDefault(!!data.isDefault);
        setIsLoading(false);
      })
      .catch(() => {
        setReports({});
        setIsDefault(true);
        setIsLoading(false);
      });

    fetch('/api/report_builder/procedures', { credentials: 'include' })
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

  const procedureKeys = useMemo(() => Object.keys(reports || {}), [reports]);
  const headerMappings = useHeaderMappings(procedureKeys);

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

  const branchLabelMap = useMemo(() => {
    const map = new Map();
    branchOptions.forEach((b) => map.set(String(b.value), b.label));
    return map;
  }, [branchOptions]);

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

  const deptLabelMap = useMemo(() => {
    const map = new Map();
    deptOptions.forEach((d) => map.set(String(d.value), d.label));
    return map;
  }, [deptOptions]);

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

  const permLabelMap = useMemo(() => {
    const map = new Map();
    permOptions.forEach((p) => map.set(String(p.value), p.label));
    return map;
  }, [permOptions]);

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
      refreshModules();
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
      refreshModules();
      addToast('Deleted', 'success');
    } catch {
      addToast('Failed to delete', 'error');
    }
  }

  const renderCollection = (values = [], map) => {
    if (!values.length) {
      return <span style={{ color: '#999' }}>All</span>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {values.map((val) => {
          const key = String(val);
          const label = map.get(key);
          return (
            <span
              key={key}
              style={{
                display: 'inline-block',
                background: '#f0f4ff',
                border: '1px solid #d6def8',
                borderRadius: '6px',
                padding: '0.15rem 0.35rem',
                fontSize: '0.85rem',
                lineHeight: 1.2,
              }}
            >
              {label ? (
                <>
                  {label}
                  <span style={{ color: '#666', marginLeft: '0.3rem' }}>
                    ({key})
                  </span>
                </>
              ) : (
                key
              )}
            </span>
          );
        })}
      </div>
    );
  };

  const renderPermissions = (values = []) => {
    if (!values.length) {
      return <span style={{ color: '#d77' }}>None selected</span>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {values.map((val) => {
          const key = String(val);
          const label = permLabelMap.get(key);
          return (
            <span
              key={key}
              style={{
                display: 'inline-block',
                background: '#f6f1ff',
                border: '1px solid #e1d7fb',
                borderRadius: '6px',
                padding: '0.15rem 0.35rem',
                fontSize: '0.85rem',
                lineHeight: 1.2,
              }}
            >
              {label ? (
                <>
                  {label}
                  <span style={{ color: '#666', marginLeft: '0.3rem' }}>
                    ({key})
                  </span>
                </>
              ) : (
                key
              )}
            </span>
          );
        })}
      </div>
    );
  };

  const reportEntries = useMemo(
    () =>
      Object.entries(reports || {}).sort(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    [reports],
  );

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Allowed Reports</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1.4fr) minmax(320px, 1fr)',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #e5e7eb',
              background: '#f8fafc',
            }}
          >
            <div>
              <strong>Current Rules</strong>
              {isDefault ? (
                <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>
                  Default configuration
                </span>
              ) : null}
            </div>
            <button type="button" onClick={handleNew}>
              New
            </button>
          </div>
          <div style={{ maxHeight: '460px', overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                      width: '22%',
                    }}
                  >
                    Procedure
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                      width: '24%',
                    }}
                  >
                    Label
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    Branches
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    Departments
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    Permissions
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    Visibility
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '0.5rem 0.75rem',
                      borderBottom: '1px solid #e2e8f0',
                      width: '80px',
                    }}
                  ></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1rem', textAlign: 'center' }}>
                      Loading…
                    </td>
                  </tr>
                ) : reportEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '1rem', textAlign: 'center' }}>
                      No report access rules configured.
                    </td>
                  </tr>
                ) : (
                  reportEntries.map(([p, info]) => {
                    const branches = info.branches || [];
                    const departments = info.departments || [];
                    const permissionsList = info.permissions || [];
                    const hasBranches = branches.length > 0;
                    const hasDepartments = departments.length > 0;
                    const hasPermissions = permissionsList.length > 0;
                    const allOpen = !hasBranches && !hasDepartments && !hasPermissions;
                    const label = headerMappings?.[p];
                    return (
                      <tr key={p}>
                        <td
                          style={{
                            padding: '0.65rem 0.75rem',
                            borderBottom: '1px solid #e2e8f0',
                            fontFamily: 'monospace',
                          }}
                        >
                          {p}
                        </td>
                        <td
                          style={{
                            padding: '0.65rem 0.75rem',
                            borderBottom: '1px solid #e2e8f0',
                            color: label ? '#0f172a' : '#94a3b8',
                          }}
                        >
                          {label || '—'}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                          {renderCollection(branches, branchLabelMap)}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                          {renderCollection(departments, deptLabelMap)}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                          {renderPermissions(permissionsList)}
                        </td>
                        <td
                          style={{
                            padding: '0.65rem 0.75rem',
                            borderBottom: '1px solid #e2e8f0',
                            color: allOpen ? '#b91c1c' : '#0f172a',
                            fontSize: '0.85rem',
                            lineHeight: 1.4,
                          }}
                        >
                          {allOpen
                            ? 'Hidden (no restrictions)'
                            : [
                                hasBranches ? `${branches.length} branch${
                                      branches.length === 1 ? '' : 'es'
                                    }` : 'All branches',
                                hasDepartments
                                  ? `${departments.length} department${
                                      departments.length === 1 ? '' : 's'
                                    }`
                                  : 'All departments',
                                hasPermissions
                                  ? `${permissionsList.length} permission level${
                                      permissionsList.length === 1 ? '' : 's'
                                    }`
                                  : 'No permissions selected',
                              ].join(' · ')}
                        </td>
                        <td
                          style={{
                            padding: '0.5rem 0.75rem',
                            borderBottom: '1px solid #e2e8f0',
                            textAlign: 'right',
                          }}
                        >
                          <button onClick={() => edit(p)} style={{ marginRight: '0.35rem' }}>
                            Edit
                          </button>
                          <button onClick={() => handleDelete(p)}>Delete</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
            padding: '1rem 1.25rem',
          }}
        >
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
