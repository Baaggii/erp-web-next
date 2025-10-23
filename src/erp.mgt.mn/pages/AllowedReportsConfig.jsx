import React, {
  useEffect,
  useState,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { refreshModules } from '../hooks/useModules.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const STORAGE_KEYS = {
  columnWidths: 'reportAccess.columnWidths',
  rulesWidth: 'reportAccess.rulesWidth',
};

const COLUMN_DEFAULT_WIDTHS = {
  procedure: 200,
  label: 220,
  branches: 240,
  departments: 240,
  permissions: 220,
  visibility: 300,
  actions: 120,
};

const COLUMN_MIN_WIDTHS = {
  procedure: 140,
  label: 160,
  branches: 180,
  departments: 180,
  permissions: 160,
  visibility: 200,
  actions: 96,
};

const MIN_RULES_WIDTH = 360;
const MAX_RULES_WIDTH = 900;
const DEFAULT_RULES_WIDTH = 560;
const MAX_COLUMN_WIDTH = 720;

export default function AllowedReportsConfig() {
  const { addToast } = useToast();
  useContext(AuthContext); // ensure auth context usage if needed
  const generalConfig = useGeneralConfig();
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
  const columnResizeRef = useRef({ key: null, startX: 0, startWidth: 0 });
  const rulesResizeRef = useRef({ active: false, startX: 0, startWidth: 0 });
  const [columnWidths, setColumnWidths] = useState(() => {
    if (typeof window === 'undefined') {
      return { ...COLUMN_DEFAULT_WIDTHS };
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEYS.columnWidths);
      const parsed = stored ? JSON.parse(stored) : {};
      return { ...COLUMN_DEFAULT_WIDTHS, ...parsed };
    } catch {
      return { ...COLUMN_DEFAULT_WIDTHS };
    }
  });
  const [rulesWidth, setRulesWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_RULES_WIDTH;
    const raw = Number(window.localStorage.getItem(STORAGE_KEYS.rulesWidth));
    if (Number.isFinite(raw)) {
      return Math.min(MAX_RULES_WIDTH, Math.max(MIN_RULES_WIDTH, raw));
    }
    return DEFAULT_RULES_WIDTH;
  });

  const startColumnResize = (key) => (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const currentWidth =
      columnWidths[key] ?? COLUMN_DEFAULT_WIDTHS[key] ?? COLUMN_MIN_WIDTHS[key];
    columnResizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: currentWidth,
    };
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }
  };

  const startRulesResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    rulesResizeRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: rulesWidth,
    };
    if (typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.columnWidths,
        JSON.stringify(columnWidths),
      );
    } catch {
      // ignore persistence failures
    }
  }, [columnWidths]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.rulesWidth,
        String(rulesWidth),
      );
    } catch {
      // ignore persistence failures
    }
  }, [rulesWidth]);

  useEffect(() => {
    function handleMove(event) {
      const { key, startX, startWidth } = columnResizeRef.current || {};
      if (key) {
        const delta = event.clientX - startX;
        const minWidth = COLUMN_MIN_WIDTHS[key] ?? 120;
        const nextWidth = Math.min(
          MAX_COLUMN_WIDTH,
          Math.max(minWidth, startWidth + delta),
        );
        setColumnWidths((prev) => {
          if (prev[key] === nextWidth) return prev;
          return { ...prev, [key]: nextWidth };
        });
        return;
      }
      const { active, startWidth: rulesStartWidth, startX: rulesStartX } =
        rulesResizeRef.current || {};
      if (active) {
        const delta = event.clientX - rulesStartX;
        const next = Math.min(
          MAX_RULES_WIDTH,
          Math.max(MIN_RULES_WIDTH, rulesStartWidth + delta),
        );
        setRulesWidth((prev) => (prev === next ? prev : next));
      }
    }

    function handleUp() {
      if (
        (columnResizeRef.current && columnResizeRef.current.key) ||
        rulesResizeRef.current?.active
      ) {
        columnResizeRef.current = { key: null, startX: 0, startWidth: 0 };
        rulesResizeRef.current = { active: false, startX: 0, startWidth: 0 };
        if (typeof document !== 'undefined') {
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }
      }
    }

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, []);

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

  const procLabels = generalConfig?.general?.procLabels || {};
  const procedureKeys = useMemo(() => Object.keys(reports || {}), [reports]);
  const headerMappings = useHeaderMappings(procedureKeys);

  const columnWidth = (key) =>
    columnWidths[key] ??
    COLUMN_DEFAULT_WIDTHS[key] ??
    COLUMN_MIN_WIDTHS[key] ??
    180;

  const headerStyle = (key, align = 'left') => ({
    textAlign: align,
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #e2e8f0',
    position: 'relative',
    width: `${columnWidth(key)}px`,
    minWidth: `${COLUMN_MIN_WIDTHS[key] ?? 120}px`,
    maxWidth: `${MAX_COLUMN_WIDTH}px`,
    boxSizing: 'border-box',
    background: '#f1f5f9',
  });

  const cellStyle = (key, align = 'left') => ({
    padding: '0.65rem 0.75rem',
    borderBottom: '1px solid #e2e8f0',
    width: `${columnWidth(key)}px`,
    minWidth: `${COLUMN_MIN_WIDTHS[key] ?? 120}px`,
    maxWidth: `${MAX_COLUMN_WIDTH}px`,
    boxSizing: 'border-box',
    textAlign: align,
    verticalAlign: 'top',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
  });

  const resizeHandleStyle = {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '8px',
    cursor: 'col-resize',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
    height: '100%',
  };

  const resizeHandleBarStyle = {
    width: '2px',
    borderRadius: '9999px',
    background: '#cbd5f5',
    height: '100%',
  };

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
          display: 'flex',
          alignItems: 'stretch',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            flex: '0 0 auto',
            width: `${rulesWidth}px`,
            minWidth: `${MIN_RULES_WIDTH}px`,
            maxWidth: `${MAX_RULES_WIDTH}px`,
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
              flex: '1 1 auto',
              maxHeight: '460px',
              overflow: 'auto',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.95rem',
                tableLayout: 'fixed',
              }}
            >
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={headerStyle('procedure')}>
                    Procedure
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('procedure')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
                  <th style={headerStyle('label')}>
                    Label
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('label')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
                  <th style={headerStyle('branches')}>
                    Branches
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('branches')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
                  <th style={headerStyle('departments')}>
                    Departments
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('departments')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
                  <th style={headerStyle('permissions')}>
                    Permissions
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('permissions')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
                  <th style={headerStyle('visibility')}>
                    Visibility
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('visibility')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
                  <th style={headerStyle('actions', 'right')}>
                    <span
                      aria-hidden="true"
                      onMouseDown={startColumnResize('actions')}
                      style={resizeHandleStyle}
                    >
                      <span style={resizeHandleBarStyle} />
                    </span>
                  </th>
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
                    const allOpen =
                      !hasBranches && !hasDepartments && !hasPermissions;
                    const labelValue =
                      procLabels[p] || headerMappings?.[p] || '';
                    return (
                      <tr key={p}>
                        <td
                          style={{
                            ...cellStyle('procedure'),
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {p}
                        </td>
                        <td
                          style={{
                            ...cellStyle('label'),
                            color: labelValue ? '#0f172a' : '#94a3b8',
                          }}
                        >
                          {labelValue || '—'}
                        </td>
                        <td style={cellStyle('branches')}>
                          {renderCollection(branches, branchLabelMap)}
                        </td>
                        <td style={cellStyle('departments')}>
                          {renderCollection(departments, deptLabelMap)}
                        </td>
                        <td style={cellStyle('permissions')}>
                          {renderPermissions(permissionsList)}
                        </td>
                        <td
                          style={{
                            ...cellStyle('visibility'),
                            color: allOpen ? '#b91c1c' : '#0f172a',
                            fontSize: '0.85rem',
                            lineHeight: 1.4,
                          }}
                        >
                          {allOpen
                            ? 'Hidden (no restrictions)'
                            : [
                                hasBranches
                                  ? `${branches.length} branch${
                                      branches.length === 1 ? '' : 'es'
                                    }`
                                  : 'All branches',
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
                            ...cellStyle('actions', 'right'),
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <button
                            onClick={() => edit(p)}
                            style={{ marginRight: '0.35rem' }}
                          >
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
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startRulesResize}
          style={{
            flex: '0 0 auto',
            width: '8px',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'center',
          }}
        >
          <span style={resizeHandleBarStyle} />
        </div>
        <div
          style={{
            flex: '1 1 0%',
            minWidth: '280px',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
            padding: '1rem 1.25rem',
            minHeight: 0,
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
