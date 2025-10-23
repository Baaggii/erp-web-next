import React, { useEffect, useState, useContext, useMemo, useCallback } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { refreshModules } from '../hooks/useModules.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

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
  const [currentWidth, setCurrentWidth] = useState(() => {
    if (typeof window === 'undefined') return 520;
    const stored = Number(window.localStorage.getItem('reportAccess.currentWidth'));
    return Number.isFinite(stored) && stored >= 360 ? stored : 520;
  });
  const [columnWidths, setColumnWidths] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = window.localStorage.getItem('reportAccess.columnWidths');
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  });
  const [tableHeight, setTableHeight] = useState(() => {
    if (typeof window === 'undefined') return 420;
    const stored = Number(window.localStorage.getItem('reportAccess.tableHeight'));
    return Number.isFinite(stored) && stored >= 280 ? stored : 420;
  });
  const [isResizingPane, setIsResizingPane] = useState(false);
  const [isResizingTable, setIsResizingTable] = useState(false);
  const [activeColumn, setActiveColumn] = useState(null);
  const generalConfig = useGeneralConfig();

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('reportAccess.currentWidth', String(currentWidth));
  }, [currentWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      'reportAccess.columnWidths',
      JSON.stringify(columnWidths),
    );
  }, [columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('reportAccess.tableHeight', String(tableHeight));
  }, [tableHeight]);

  const getProcLabel = useCallback(
    (procedure) => {
      const overrides = generalConfig?.general?.procLabels || {};
      return overrides[procedure] || headerMappings?.[procedure] || '';
    },
    [generalConfig?.general?.procLabels, headerMappings],
  );

  const formatProcedureOption = useCallback(
    (name) => {
      const label = getProcLabel(name);
      return label ? `${label} (${name})` : name;
    },
    [getProcLabel],
  );

  const tableColumns = useMemo(
    () => [
      {
        key: 'procedure',
        header: 'Procedure',
        minWidth: 160,
        defaultWidth: 220,
        render: (proc) => (
          <span style={{ fontFamily: 'monospace' }}>{proc}</span>
        ),
      },
      {
        key: 'label',
        header: 'Label',
        minWidth: 160,
        defaultWidth: 220,
        render: (proc) => {
          const label = getProcLabel(proc);
          return (
            <span style={{ color: label ? '#0f172a' : '#94a3b8' }}>
              {label || '—'}
            </span>
          );
        },
      },
      {
        key: 'branches',
        header: 'Branches',
        minWidth: 200,
        defaultWidth: 240,
        render: (proc, info) => renderCollection(info.branches || [], branchLabelMap),
      },
      {
        key: 'departments',
        header: 'Departments',
        minWidth: 200,
        defaultWidth: 240,
        render: (proc, info) => renderCollection(info.departments || [], deptLabelMap),
      },
      {
        key: 'permissions',
        header: 'Permissions',
        minWidth: 200,
        defaultWidth: 260,
        render: (proc, info) => renderPermissions(info.permissions || []),
      },
      {
        key: 'visibility',
        header: 'Visibility',
        minWidth: 220,
        defaultWidth: 280,
        render: (proc, info) => {
          const branchesList = info.branches || [];
          const departmentsList = info.departments || [];
          const permissionsList = info.permissions || [];
          const hasBranches = branchesList.length > 0;
          const hasDepartments = departmentsList.length > 0;
          const hasPermissions = permissionsList.length > 0;
          const allOpen = !hasBranches && !hasDepartments && !hasPermissions;
          return (
            <span
              style={{
                color: allOpen ? '#b91c1c' : '#0f172a',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                display: 'inline-block',
              }}
            >
              {allOpen
                ? 'Hidden (no restrictions)'
                : [
                    hasBranches
                      ? `${branchesList.length} branch${
                          branchesList.length === 1 ? '' : 'es'
                        }`
                      : 'All branches',
                    hasDepartments
                      ? `${departmentsList.length} department${
                          departmentsList.length === 1 ? '' : 's'
                        }`
                      : 'All departments',
                    hasPermissions
                      ? `${permissionsList.length} permission level${
                          permissionsList.length === 1 ? '' : 's'
                        }`
                      : 'No permissions selected',
                  ].join(' · ')}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        minWidth: 120,
        defaultWidth: 120,
        render: (proc) => (
          <div style={{ textAlign: 'right' }}>
            <button onClick={() => edit(proc)} style={{ marginRight: '0.35rem' }}>
              Edit
            </button>
            <button onClick={() => handleDelete(proc)}>Delete</button>
          </div>
        ),
      },
    ],
    [
      branchLabelMap,
      deptLabelMap,
      getProcLabel,
      permLabelMap,
    ],
  );

  const getColumnWidth = useCallback(
    (key) => {
      const width = columnWidths[key];
      if (typeof width === 'number' && width >= 120) return width;
      const fallback = tableColumns.find((col) => col.key === key)?.defaultWidth;
      return fallback ?? 160;
    },
    [columnWidths, tableColumns],
  );

  const handleColumnResizeStart = useCallback(
    (key, event) => {
      if (typeof window === 'undefined') return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = getColumnWidth(key);
      setActiveColumn(key);

      function onMove(e) {
        const delta = e.clientX - startX;
        const min = tableColumns.find((col) => col.key === key)?.minWidth || 120;
        const next = Math.max(min, startWidth + delta);
        setColumnWidths((prev) => ({ ...prev, [key]: next }));
      }

      function onUp() {
        setActiveColumn(null);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
    },
    [getColumnWidth, tableColumns],
  );

  const handlePaneResizeStart = useCallback(
    (event) => {
      if (typeof window === 'undefined') return;
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = currentWidth;
      setIsResizingPane(true);

      function onMove(e) {
        const delta = e.clientX - startX;
        const minWidth = 360;
        const maxWidth = Math.max(minWidth, window.innerWidth - 280);
        const next = Math.min(Math.max(minWidth, startWidth + delta), maxWidth);
        setCurrentWidth(next);
      }

      function onUp() {
        setIsResizingPane(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
    },
    [currentWidth],
  );

  const handleTableResizeStart = useCallback(
    (event) => {
      if (typeof window === 'undefined') return;
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = tableHeight;
      setIsResizingTable(true);

      function onMove(e) {
        const delta = e.clientY - startY;
        const minHeight = 280;
        const maxHeight = Math.max(minHeight, window.innerHeight - 260);
        const next = Math.min(Math.max(minHeight, startHeight + delta), maxHeight);
        setTableHeight(next);
      }

      function onUp() {
        setIsResizingTable(false);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
    },
    [tableHeight],
  );

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>Allowed Reports</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${currentWidth}px 12px minmax(320px, 1fr)`,
          alignItems: 'start',
          gap: '0',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
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
          <div
            style={{
              height: `${tableHeight}px`,
              overflow: 'auto',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                fontSize: '0.95rem',
              }}
            >
              <colgroup>
                {tableColumns.map((col) => (
                  <col key={col.key} style={{ width: `${getColumnWidth(col.key)}px` }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {tableColumns.map((col, index) => {
                    const isLast = index === tableColumns.length - 1;
                    return (
                      <th
                        key={col.key}
                        style={{
                          textAlign: isLast ? 'right' : 'left',
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid #e2e8f0',
                          position: 'relative',
                        }}
                      >
                        <span>{col.header}</span>
                        {!isLast ? (
                          <span
                            onMouseDown={(e) => handleColumnResizeStart(col.key, e)}
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: '-4px',
                              width: '8px',
                              height: '100%',
                              cursor: 'col-resize',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span
                              style={{
                                width: '2px',
                                height: '60%',
                                background:
                                  activeColumn === col.key ? '#2563eb' : 'transparent',
                              }}
                            />
                          </span>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length}
                      style={{ padding: '1rem', textAlign: 'center' }}
                    >
                      Loading…
                    </td>
                  </tr>
                ) : reportEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length}
                      style={{ padding: '1rem', textAlign: 'center' }}
                    >
                      No report access rules configured.
                    </td>
                  </tr>
                ) : (
                  reportEntries.map(([p, info]) => (
                    <tr key={p}>
                      {tableColumns.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            padding: '0.65rem 0.75rem',
                            borderBottom: '1px solid #e2e8f0',
                            verticalAlign: 'top',
                          }}
                        >
                          {col.render(p, info)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div
            onMouseDown={handleTableResizeStart}
            style={{
              height: '14px',
              cursor: 'row-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8fafc',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: '40%',
                height: '3px',
                borderRadius: '999px',
                background: isResizingTable ? '#2563eb' : '#cbd5f5',
              }}
            />
          </div>
        </div>
        <div
          onMouseDown={handlePaneResizeStart}
          style={{
            width: '12px',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: '3px',
              height: '60%',
              borderRadius: '999px',
              background: isResizingPane ? '#2563eb' : '#cbd5f5',
            }}
          />
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
                          {formatProcedureOption(p.name)}
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
                          {formatProcedureOption(p.name)}
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
