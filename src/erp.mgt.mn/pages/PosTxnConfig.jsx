import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { refreshModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

const emptyConfig = {
  label: '',
  masterTable: '',
  masterForm: '',
  masterType: 'single',
  masterPosition: 'upper_left',
  masterView: 'fitted',
  tables: [],
  calcFields: [],
  posFields: [],
  statusField: { table: '', field: '', created: '', beforePost: '', posted: '' },
  allowedBranches: [],
  allowedDepartments: [],
  allowedUserRights: [],
  allowedWorkplaces: [],
  procedures: [],
  allowTemporarySubmission: false,
  supportsTemporarySubmission: false,
  temporaryAllowedBranches: [],
  temporaryAllowedDepartments: [],
  temporaryAllowedUserRights: [],
  temporaryAllowedWorkplaces: [],
  temporaryProcedures: [],
};

export default function PosTxnConfig() {
  const { addToast } = useToast();
  const { company } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [configs, setConfigs] = useState({});
  const [isDefault, setIsDefault] = useState(false);
  const [name, setName] = useState('');
  const [formOptions, setFormOptions] = useState({});
  const [formNames, setFormNames] = useState([]);
  const [formToTable, setFormToTable] = useState({});
  const [formFields, setFormFields] = useState({});
  const [tables, setTables] = useState([]);
  const [masterCols, setMasterCols] = useState([]);
  const [tableColumns, setTableColumns] = useState({});
  const [statusOptions, setStatusOptions] = useState([]);
  const [config, setConfig] = useState(emptyConfig);
  const [branches, setBranches] = useState([]);
  const [branchCfg, setBranchCfg] = useState({ idField: null, displayFields: [] });
  const [departments, setDepartments] = useState([]);
  const [deptCfg, setDeptCfg] = useState({ idField: null, displayFields: [] });
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [userRights, setUserRights] = useState([]);
  const [userRightCfg, setUserRightCfg] = useState({ idField: null, displayFields: [] });
  const [workplaces, setWorkplaces] = useState([]);
  const [workplaceCfg, setWorkplaceCfg] = useState({ idField: null, displayFields: [] });
  const procPrefix = generalConfig?.general?.reportProcPrefix || '';
  const branchOptions = useMemo(() => {
    const idField = branchCfg?.idField || 'id';
    return branches.map((b) => {
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
  }, [branches, branchCfg]);

  const deptOptions = useMemo(() => {
    const idField = deptCfg?.idField || 'id';
    return departments.map((d) => {
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
  }, [departments, deptCfg]);

  const userRightOptions = useMemo(() => {
    const idField = userRightCfg?.idField || 'userlevel_id';
    return userRights.map((right) => {
      const val =
        right[idField] ?? right.userlevel_id ?? right.id ?? right.userlevelId ?? '';
      const label = userRightCfg?.displayFields?.length
        ? userRightCfg.displayFields
            .map((field) => right[field])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(right)
            .filter((v) => v !== undefined && v !== null)
            .join(' - ');
      return { value: String(val), label: label || String(val) };
    });
  }, [userRights, userRightCfg]);

  const workplaceOptions = useMemo(() => {
    const idField = workplaceCfg?.idField || 'workplace_id';
    return workplaces.map((workplace) => {
      const val =
        workplace[idField] ?? workplace.workplace_id ?? workplace.id ?? workplace.workplaceId ?? '';
      const label = workplaceCfg?.displayFields?.length
        ? workplaceCfg.displayFields
            .map((field) => workplace[field])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(workplace)
            .filter((v) => v !== undefined && v !== null)
            .join(' - ');
      return { value: String(val), label: label || String(val) };
    });
  }, [workplaces, workplaceCfg]);

  const sectionStyle = useMemo(
    () => ({
      border: '1px solid #d0d7de',
      borderRadius: '8px',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }),
    [],
  );

  const sectionTitleStyle = useMemo(
    () => ({
      margin: '0 0 0.5rem',
      fontSize: '1.1rem',
      fontWeight: 600,
    }),
    [],
  );

  const subsectionTitleStyle = useMemo(
    () => ({
      margin: '0 0 0.25rem',
      fontSize: '1rem',
      fontWeight: 600,
    }),
    [],
  );

  const controlGroupStyle = useMemo(
    () => ({
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      gap: '1rem',
    }),
    [],
  );

  const fieldColumnStyle = useMemo(
    () => ({
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      minWidth: '220px',
    }),
    [],
  );

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isDefault: true }))
      .then((data) => {
        setIsDefault(!!data.isDefault);
        const { isDefault: _def, ...rest } = data || {};
        setConfigs(rest);
      })
      .catch(() => {
        setConfigs({});
        setIsDefault(true);
      });

    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const byTable = {};
        const names = [];
        const mapping = {};
        const fields = {};
        for (const [name, info] of Object.entries(data)) {
          const tbl = info.table;
          mapping[name] = tbl;
          names.push(name);
          fields[name] = Array.isArray(info.visibleFields) ? info.visibleFields : [];
          if (!byTable[tbl]) byTable[tbl] = [];
          byTable[tbl].push(name);
        }
        setFormOptions(byTable);
        setFormNames(names);
        setFormToTable(mapping);
        setFormFields(fields);
      })
      .catch(() => {
        setFormOptions({});
        setFormNames([]);
        setFormToTable({});
        setFormFields({});
      });

    fetch('/api/tables', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTables(data))
      .catch(() => setTables([]));

    fetch('/api/tables/code_branches?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setBranches(data.rows || []))
      .catch(() => setBranches([]));

    fetch('/api/tables/user_levels?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setUserRights(data.rows || []))
      .catch(() => setUserRights([]));

    fetch('/api/tables/code_workplace?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setWorkplaces(data.rows || []))
      .catch(() => setWorkplaces([]));

    fetch('/api/display_fields?table=code_branches', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { idField: null, displayFields: [] },
      )
      .then((cfg) => setBranchCfg(cfg || { idField: null, displayFields: [] }))
      .catch(() => setBranchCfg({ idField: null, displayFields: [] }));

    fetch('/api/display_fields?table=user_levels', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { idField: null, displayFields: [] },
      )
      .then((cfg) => setUserRightCfg(cfg || { idField: null, displayFields: [] }))
      .catch(() => setUserRightCfg({ idField: null, displayFields: [] }));

    fetch('/api/tables/code_department?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setDepartments(data.rows || []))
      .catch(() => setDepartments([]));

    fetch('/api/display_fields?table=code_department', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { idField: null, displayFields: [] },
      )
      .then((cfg) => setDeptCfg(cfg || { idField: null, displayFields: [] }))
      .catch(() => setDeptCfg({ idField: null, displayFields: [] }));

    fetch('/api/display_fields?table=code_workplace', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { idField: null, displayFields: [] },
      )
      .then((cfg) => setWorkplaceCfg(cfg || { idField: null, displayFields: [] }))
      .catch(() => setWorkplaceCfg({ idField: null, displayFields: [] }));

  }, []);



  useEffect(() => {
    if (!config.statusField.table) {
      setStatusOptions([]);
      return;
    }
    fetch(
      `/api/tables/${encodeURIComponent(config.statusField.table)}?perPage=500`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        const opts = (data.rows || []).map((r) => {
          const vals = Object.values(r).filter((v) => v !== undefined);
          return { value: vals[0], label: vals.slice(0, 2).join(' - ') };
        });
        setStatusOptions(opts);
      })
      .catch(() => setStatusOptions([]));
  }, [config.statusField.table]);

  useEffect(() => {
    const qs = procPrefix ? `?prefix=${encodeURIComponent(procPrefix)}` : '';
    fetch(`/api/procedures${qs}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { procedures: [] }))
      .then((data) => {
        const list = Array.isArray(data.procedures) ? data.procedures : [];
        const normalized = list
          .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
          .filter((proc) => proc)
          .sort((a, b) => a.localeCompare(b));
        setProcedureOptions(normalized);
      })
      .catch(() => setProcedureOptions([]));
  }, [procPrefix]);

  useEffect(() => {
    const tbls = [config.masterTable, ...config.tables.map((t) => t.table)];
    tbls.forEach((tbl) => {
      if (!tbl || tableColumns[tbl]) return;
      fetch(`/api/tables/${encodeURIComponent(tbl)}/columns`, {
        credentials: 'include',
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((cols) => {
          const names = cols.map((c) => c.name || c);
          setTableColumns((m) => ({ ...m, [tbl]: names }));
          if (tbl === config.masterTable) setMasterCols(names);
        })
        .catch(() => {});
    });
  }, [config.masterTable, config.tables, tableColumns]);

  async function loadConfig(n) {
    if (!n) {
      setName('');
      setConfig({ ...emptyConfig });
      return;
    }
    try {
      const res = await fetch(`/api/pos_txn_config?name=${encodeURIComponent(n)}`, {
        credentials: 'include',
      });
      const cfg = res.ok ? await res.json() : {};
      const { isDefault: def, ...rest } = cfg || {};
      const loaded = { ...emptyConfig, ...(rest || {}) };
      if (Array.isArray(loaded.tables) && loaded.tables.length > 0) {
        const [master, ...rest] = loaded.tables;
        loaded.masterTable = master.table || '';
        loaded.masterForm = master.form || '';
        loaded.masterType = master.type || 'single';
        loaded.masterPosition = master.position || 'upper_left';
        loaded.masterView = master.view || 'fitted';
        loaded.tables = rest.map((t) => ({ view: 'fitted', ...t }));
      }
      if (!loaded.masterView) loaded.masterView = 'fitted';
      if (loaded.label === undefined) loaded.label = '';
      if (Array.isArray(loaded.calcFields)) {
        loaded.calcFields = loaded.calcFields.map((row, rIdx) => {
          const cells = Array.isArray(row.cells)
            ? row.cells.map((c, cIdx) => ({
                table:
                  c.table ||
                  (cIdx === 0
                    ? loaded.masterTable
                    : loaded.tables[cIdx - 1]?.table || ''),
                field: c.field || '',
                agg: c.agg || '',
              }))
            : [];
          while (cells.length < loaded.tables.length + 1)
            cells.push({ table: '', field: '', agg: '' });
          return { name: row.name || `Map${rIdx + 1}`, cells };
        });
      } else {
        loaded.calcFields = [];
      }

      if (Array.isArray(loaded.posFields)) {
        loaded.posFields = loaded.posFields.map((p, idx) => {
          const parts = Array.isArray(p.parts)
            ? p.parts.map((pt, pIdx) => ({
                agg: pt.agg || (pIdx === 0 ? '=' : '+'),
                field: pt.field || '',
                table: pt.table || loaded.masterTable,
              }))
            : [{ agg: '=', field: '', table: loaded.masterTable }];
          return { name: p.name || `PF${idx + 1}`, parts };
        });
      } else {
        loaded.posFields = [];
      }

      if (!loaded.statusField) loaded.statusField = { table: '', field: '', created: '', beforePost: '', posted: '' };
      loaded.allowedBranches = Array.isArray(loaded.allowedBranches)
        ? Array.from(
            new Set(
              loaded.allowedBranches
                .map((b) => (b === undefined || b === null ? '' : String(b)))
                .filter((b) => b.trim() !== ''),
            ),
          )
        : [];
      loaded.allowedDepartments = Array.isArray(loaded.allowedDepartments)
        ? Array.from(
            new Set(
              loaded.allowedDepartments
                .map((d) => (d === undefined || d === null ? '' : String(d)))
                .filter((d) => d.trim() !== ''),
            ),
          )
        : [];
      loaded.allowedUserRights = Array.isArray(loaded.allowedUserRights)
        ? Array.from(
            new Set(
              loaded.allowedUserRights
                .map((r) => (r === undefined || r === null ? '' : String(r)))
                .filter((r) => r.trim() !== ''),
            ),
          )
        : [];
      loaded.allowedWorkplaces = Array.isArray(loaded.allowedWorkplaces)
        ? Array.from(
            new Set(
              loaded.allowedWorkplaces
                .map((w) => (w === undefined || w === null ? '' : String(w)))
                .filter((w) => w.trim() !== ''),
            ),
          )
        : [];
      const tempEnabled = Boolean(
        loaded.supportsTemporarySubmission ??
          loaded.allowTemporarySubmission ??
          loaded.supportsTemporary ??
          false,
      );
      loaded.allowTemporarySubmission = tempEnabled;
      loaded.supportsTemporarySubmission = tempEnabled;
      loaded.temporaryAllowedBranches = Array.isArray(loaded.temporaryAllowedBranches)
        ? Array.from(
            new Set(
              loaded.temporaryAllowedBranches
                .map((b) => (b === undefined || b === null ? '' : String(b)))
                .filter((b) => b.trim() !== ''),
            ),
          )
        : [];
      loaded.temporaryAllowedDepartments = Array.isArray(
        loaded.temporaryAllowedDepartments,
      )
        ? Array.from(
            new Set(
              loaded.temporaryAllowedDepartments
                .map((d) => (d === undefined || d === null ? '' : String(d)))
                .filter((d) => d.trim() !== ''),
            ),
          )
        : [];
      loaded.temporaryAllowedUserRights = Array.isArray(
        loaded.temporaryAllowedUserRights,
      )
        ? Array.from(
            new Set(
              loaded.temporaryAllowedUserRights
                .map((r) => (r === undefined || r === null ? '' : String(r)))
                .filter((r) => r.trim() !== ''),
            ),
          )
        : [];
      loaded.temporaryAllowedWorkplaces = Array.isArray(
        loaded.temporaryAllowedWorkplaces,
      )
        ? Array.from(
            new Set(
              loaded.temporaryAllowedWorkplaces
                .map((w) => (w === undefined || w === null ? '' : String(w)))
                .filter((w) => w.trim() !== ''),
            ),
          )
        : [];
      loaded.procedures = Array.isArray(loaded.procedures)
        ? Array.from(
            new Set(
              loaded.procedures
                .map((p) => (typeof p === 'string' ? p.trim() : ''))
                .filter((p) => p),
            ),
          )
        : [];
      loaded.temporaryProcedures = Array.isArray(loaded.temporaryProcedures)
        ? Array.from(
            new Set(
              loaded.temporaryProcedures
                .map((p) => (typeof p === 'string' ? p.trim() : ''))
                .filter((p) => p),
            ),
          )
        : [];
      setIsDefault(!!def);
      setName(n);
      setConfig(loaded);
    } catch {
      setIsDefault(true);
      setName(n);
      setConfig({ ...emptyConfig });
    }
  }

  function addColumn() {
    setConfig((c) => ({
      ...c,
      tables: [
        ...c.tables,
        { table: '', form: '', type: 'single', position: 'upper_left', view: 'fitted' },
      ],
      calcFields: c.calcFields.map((row) => ({
        ...row,
        cells: [...row.cells, { table: '', field: '', agg: '' }],
      })),
    }));
  }

  function updateColumn(idx, key, value) {
    setConfig((c) => {
      const tables = c.tables.map((t, i) => {
        if (i !== idx) return t;
        if (key === 'form') {
          const tbl = formToTable[value] || '';
          return { ...t, form: value, table: tbl };
        }
        if (key === 'table') {
          return { ...t, table: value };
        }
        return { ...t, [key]: value };
      });
      const newTbl =
        key === 'form'
          ? formToTable[value] || ''
          : key === 'table'
          ? value
          : tables[idx].table;
      return {
        ...c,
        tables,
        calcFields: c.calcFields.map((row) => ({
          ...row,
          cells: row.cells.map((cell, cIdx) =>
            cIdx === idx + 1 ? { ...cell, table: newTbl } : cell,
          ),
        })),
      };
    });
  }

  function removeColumn(idx) {
    setConfig((c) => {
      const tbl = c.tables[idx]?.table;
      return {
        ...c,
        masterTable: c.masterTable === tbl ? '' : c.masterTable,
        masterForm: c.masterTable === tbl ? '' : c.masterForm,
        tables: c.tables.filter((_, i) => i !== idx),
        calcFields: c.calcFields.map((row) => ({
          ...row,
          cells: row.cells.filter((_, i) => i !== idx + 1),
        })),
      };
    });
  }

  function removeMaster() {
    setConfig((c) => ({
      ...c,
      masterTable: '',
      masterForm: '',
      masterView: 'fitted',
      calcFields: c.calcFields.map((row) => ({
        ...row,
        cells: row.cells.map((cell, i) => (i === 0 ? { ...cell, table: '' } : cell)),
      })),
      posFields: c.posFields.map((p) => ({
        ...p,
        parts: p.parts.map((pt) => ({ ...pt, table: '' })),
      })),
    }));
  }

  async function handleSave() {
    if (!name) {
      addToast('Name required', 'error');
      return;
    }
    const normalizeAccessForSave = (list) =>
      Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((item) => {
                  if (item === undefined || item === null) return null;
                  const num = Number(item);
                  if (Number.isFinite(num)) return num;
                  const str = String(item).trim();
                  return str ? str : null;
                })
                .filter((val) => val !== null),
            ),
          )
        : [];
    const normalizedProcedures = Array.isArray(config.procedures)
      ? Array.from(
          new Set(
            config.procedures
              .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
              .filter((proc) => proc),
          ),
        )
      : [];
    const normalizedTemporaryProcedures = Array.isArray(config.temporaryProcedures)
      ? Array.from(
          new Set(
            config.temporaryProcedures
              .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
              .filter((proc) => proc),
          ),
        )
      : [];
    const allowTemporary = Boolean(
      config.supportsTemporarySubmission ??
        config.allowTemporarySubmission ??
        config.supportsTemporary ??
        false,
    );
    const saveCfg = {
      ...config,
      allowTemporarySubmission: allowTemporary,
      supportsTemporarySubmission: allowTemporary,
      allowedBranches: normalizeAccessForSave(config.allowedBranches),
      allowedDepartments: normalizeAccessForSave(config.allowedDepartments),
      allowedUserRights: normalizeAccessForSave(config.allowedUserRights),
      allowedWorkplaces: normalizeAccessForSave(config.allowedWorkplaces),
      temporaryAllowedBranches: normalizeAccessForSave(
        config.temporaryAllowedBranches,
      ),
      temporaryAllowedDepartments: normalizeAccessForSave(
        config.temporaryAllowedDepartments,
      ),
      temporaryAllowedUserRights: normalizeAccessForSave(
        config.temporaryAllowedUserRights,
      ),
      temporaryAllowedWorkplaces: normalizeAccessForSave(
        config.temporaryAllowedWorkplaces,
      ),
      procedures: normalizedProcedures,
      temporaryProcedures: normalizedTemporaryProcedures,
      tables: [
        {
          table: config.masterTable,
          form: config.masterForm,
          type: config.masterType,
          position: config.masterPosition,
          view: config.masterView,
        },
        ...config.tables,
      ],
    };
    if (isDefault) {
      try {
        const resImport = await fetch(
          `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ files: ['posTransactionConfig.json'] }),
          },
        );
        if (!resImport.ok) throw new Error('import failed');
        setIsDefault(false);
      } catch (err) {
        addToast(`Import failed: ${err.message}`, 'error');
        return;
      }
    }
    await fetch('/api/pos_txn_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, config: saveCfg }),
    });
    refreshTxnModules();
    refreshModules();
    addToast('Saved', 'success');
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isDefault: true }))
      .then((data) => {
        setIsDefault(!!data.isDefault);
        const { isDefault: _def, ...rest } = data || {};
        setConfigs(rest);
      })
      .catch(() => {});
  }

  async function handleDelete() {
    if (!name) return;
    if (!window.confirm('Delete configuration?')) return;
    try {
      const res = await fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        addToast('Delete failed', 'error');
        return;
      }
      refreshTxnModules();
      refreshModules();
      addToast('Deleted', 'success');
      setName('');
      setConfig({ ...emptyConfig });
      fetch('/api/pos_txn_config', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { isDefault: true }))
        .then((data) => {
          setIsDefault(!!data.isDefault);
          const { isDefault: _def, ...rest } = data || {};
          setConfigs(rest);
        })
        .catch(() => {});
    } catch {
      addToast('Delete failed', 'error');
    }
  }

  async function handleImport() {
    if (
      !window.confirm(
        'Importing defaults will overwrite the current configuration. Continue?'
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ files: ['posTransactionConfig.json'] }),
        },
      );
      if (!res.ok) throw new Error('failed');
      refreshTxnModules();
      refreshModules();
      const resCfg = await fetch('/api/pos_txn_config', { credentials: 'include' });
      const data = resCfg.ok ? await resCfg.json() : { isDefault: true };
      setIsDefault(!!data.isDefault);
      const { isDefault: _def, ...rest } = data || {};
      setConfigs(rest);
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  function handleAddCalc() {
    setConfig((c) => ({
      ...c,
      calcFields: [
        ...c.calcFields,
        {
          name: `Map${c.calcFields.length + 1}`,
          cells: [
            config.masterTable,
            ...c.tables.map((t) => t.table),
          ].map((tbl) => ({ table: tbl, field: '', agg: '' })),
        },
      ],
    }));
  }

  function updateCalc(rowIdx, colIdx, key, value) {
    setConfig((c) => ({
      ...c,
      calcFields: c.calcFields.map((row, r) =>
        r === rowIdx
          ? { ...row, cells: row.cells.map((cell, cIdx) => (cIdx === colIdx ? { ...cell, [key]: value } : cell)) }
          : row,
      ),
    }));
  }

  function removeCalc(idx) {
    setConfig((c) => ({
      ...c,
      calcFields: c.calcFields.filter((_, i) => i !== idx),
    }));
  }

  function handleAddPos() {
    setConfig((c) => ({
      ...c,
      posFields: [
        ...c.posFields,
        {
          name: `PF${c.posFields.length + 1}`,
          parts: [{ table: c.masterTable, agg: '=', field: '' }],
        },
      ],
    }));
  }

  function addPosPart(idx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) =>
        i === idx
          ? { ...f, parts: [...f.parts, { table: c.masterTable, agg: '+', field: '' }] }
          : f,
      ),
    }));
  }

  function updatePos(idx, partIdx, key, value) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) => {
        if (i !== idx) return f;
        if (partIdx === null) return { ...f };
        return {
          ...f,
          parts: f.parts.map((p, j) => (j === partIdx ? { ...p, [key]: value } : p)),
        };
      }),
    }));
  }

  function removePos(idx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.filter((_, i) => i !== idx),
    }));
  }

  function removePosPart(idx, partIdx) {
    setConfig((c) => ({
      ...c,
      posFields: c.posFields.map((f, i) =>
        i === idx ? { ...f, parts: f.parts.filter((_, j) => j !== partIdx) } : f,
      ),
    }));
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <h2>POS Transaction Config</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Configuration Selection</h3>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
          >
            <select value={name} onChange={(e) => loadConfig(e.target.value)}>
              <option value="">-- select config --</option>
              {Object.keys(configs).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Config name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name && (
              <button onClick={handleDelete} style={{ marginLeft: '0.5rem' }}>
                Delete
              </button>
            )}
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Master Form Settings</h3>
          <div style={controlGroupStyle}>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Label</span>
              <input
                type="text"
                value={config.label}
                onChange={(e) => setConfig((c) => ({ ...c, label: e.target.value }))}
              />
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Master Table</span>
              <select
                value={config.masterTable}
                onChange={(e) => {
                  const tbl = e.target.value;
                  setConfig((c) => {
                    const idx = c.tables.findIndex((t) => t.table === tbl);
                    let tables = c.tables;
                    let masterForm = '';
                    if (idx !== -1) {
                      masterForm = c.tables[idx].form || '';
                      tables = c.tables.filter((_, i) => i !== idx);
                    }
                    return {
                      ...c,
                      masterTable: tbl,
                      masterForm,
                      tables,
                      calcFields: c.calcFields.map((row) => ({
                        ...row,
                        cells: row.cells.map((cell, i) =>
                          i === 0 ? { ...cell, table: tbl } : cell,
                        ),
                      })),
                      posFields: c.posFields.map((p) => ({
                        ...p,
                        parts: p.parts.map((pt) => ({ ...pt, table: tbl })),
                      })),
                    };
                  });
                }}
              >
                <option value="">-- select table --</option>
                {config.masterTable &&
                  !config.tables.some((t) => t.table === config.masterTable) && (
                    <option value={config.masterTable}>{config.masterTable}</option>
                  )}
                {config.tables.map((t, i) => (
                  <option key={i} value={t.table}>
                    {t.table}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Access Control</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.allowTemporarySubmission)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConfig((c) => ({
                      ...c,
                      allowTemporarySubmission: checked,
                      supportsTemporarySubmission: checked,
                    }));
                  }}
                />
                <span>Allow temporary transaction submissions</span>
              </label>
              <small style={{ color: '#666' }}>
                Enable temporary saves that require confirmation before posting.
              </small>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h4 style={subsectionTitleStyle}>Regular access</h4>
                <div style={controlGroupStyle}>
                  <div style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Allowed branches</span>
                    <select
                      multiple
                      size={8}
                      value={config.allowedBranches}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          allowedBranches: Array.from(
                            e.target.selectedOptions,
                            (o) => o.value,
                          ),
                        }))
                      }
                    >
                      {branchOptions.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            allowedBranches: branchOptions.map((b) => b.value),
                          }))
                        }
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, allowedBranches: [] }))}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Allowed departments</span>
                    <select
                      multiple
                      size={8}
                      value={config.allowedDepartments}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          allowedDepartments: Array.from(
                            e.target.selectedOptions,
                            (o) => o.value,
                          ),
                        }))
                      }
                    >
                      {deptOptions.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            allowedDepartments: deptOptions.map((d) => d.value),
                          }))
                        }
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, allowedDepartments: [] }))}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Allowed user rights</span>
                    <select
                      multiple
                      size={8}
                      value={config.allowedUserRights}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          allowedUserRights: Array.from(
                            e.target.selectedOptions,
                            (o) => o.value,
                          ),
                        }))
                      }
                    >
                      {userRightOptions.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            allowedUserRights: userRightOptions.map((r) => r.value),
                          }))
                        }
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, allowedUserRights: [] }))}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  <div style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Allowed workplaces</span>
                    <select
                      multiple
                      size={8}
                      value={config.allowedWorkplaces}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          allowedWorkplaces: Array.from(
                            e.target.selectedOptions,
                            (o) => o.value,
                          ),
                        }))
                      }
                    >
                      {workplaceOptions.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((c) => ({
                            ...c,
                            allowedWorkplaces: workplaceOptions.map((w) => w.value),
                          }))
                        }
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, allowedWorkplaces: [] }))}
                      >
                        None
                      </button>
                    </div>
                  </div>

                  {procedureOptions.length > 0 && (
                    <div style={fieldColumnStyle}>
                      <span style={{ fontWeight: 600 }}>Allowed procedures</span>
                      <select
                        multiple
                        size={8}
                        value={config.procedures}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            procedures: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {procedureOptions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {config.allowTemporarySubmission && (
                <div>
                  <h4 style={subsectionTitleStyle}>Temporary access</h4>
                  <div style={controlGroupStyle}>
                    <div style={fieldColumnStyle}>
                      <span style={{ fontWeight: 600 }}>Temporary allowed branches</span>
                      <select
                        multiple
                        size={8}
                        value={config.temporaryAllowedBranches}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            temporaryAllowedBranches: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {branchOptions.map((b) => (
                          <option key={b.value} value={b.value}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              temporaryAllowedBranches: branchOptions.map((b) => b.value),
                            }))
                          }
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, temporaryAllowedBranches: [] }))
                          }
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div style={fieldColumnStyle}>
                      <span style={{ fontWeight: 600 }}>Temporary allowed departments</span>
                      <select
                        multiple
                        size={8}
                        value={config.temporaryAllowedDepartments}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            temporaryAllowedDepartments: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {deptOptions.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              temporaryAllowedDepartments: deptOptions.map((d) => d.value),
                            }))
                          }
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, temporaryAllowedDepartments: [] }))
                          }
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div style={fieldColumnStyle}>
                      <span style={{ fontWeight: 600 }}>Temporary allowed user rights</span>
                      <select
                        multiple
                        size={8}
                        value={config.temporaryAllowedUserRights}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            temporaryAllowedUserRights: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {userRightOptions.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              temporaryAllowedUserRights: userRightOptions.map((r) => r.value),
                            }))
                          }
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, temporaryAllowedUserRights: [] }))
                          }
                        >
                          None
                        </button>
                      </div>
                    </div>

                    <div style={fieldColumnStyle}>
                      <span style={{ fontWeight: 600 }}>Temporary allowed workplaces</span>
                      <select
                        multiple
                        size={8}
                        value={config.temporaryAllowedWorkplaces}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            temporaryAllowedWorkplaces: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {workplaceOptions.map((w) => (
                          <option key={w.value} value={w.value}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              temporaryAllowedWorkplaces: workplaceOptions.map((w) => w.value),
                            }))
                          }
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, temporaryAllowedWorkplaces: [] }))
                          }
                        >
                          None
                        </button>
                      </div>
                    </div>

                    {procedureOptions.length > 0 && (
                      <div style={fieldColumnStyle}>
                        <span style={{ fontWeight: 600 }}>
                          Temporary allowed procedures
                        </span>
                        <select
                          multiple
                          size={8}
                          value={config.temporaryProcedures}
                          onChange={(e) =>
                            setConfig((c) => ({
                              ...c,
                              temporaryProcedures: Array.from(
                                e.target.selectedOptions,
                                (o) => o.value,
                              ),
                            }))
                          }
                        >
                          {procedureOptions.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Form Configuration</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="pos-config-grid" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th></th>
                  <th>
                    {config.masterTable || 'Master'}{' '}
                {config.masterTable && (
                  <button onClick={() => removeMaster()}>x</button>
                )}
              </th>
              {config.tables.map((t, idx) => (
                <th key={idx} style={{ borderBottom: '1px solid #ccc', padding: '4px' }}>
                  {t.form || 'New'}{' '}
                  <button onClick={() => removeColumn(idx)}>x</button>
                </th>
              ))}
              <th>
                <button onClick={addColumn}>Add</button>
              </th>
            </tr>
          </thead>
              <tbody>
                <tr>
                  <td>Transaction Form</td>
                  <td style={{ padding: '4px' }}>
                    <select
                  value={config.masterForm}
                  onChange={(e) => {
                    const form = e.target.value;
                    const tbl = formToTable[form] || config.masterTable;
                    setConfig((c) => ({
                      ...c,
                      masterForm: form,
                      masterTable: tbl,
                      calcFields: c.calcFields.map((row) => ({
                        ...row,
                        cells: row.cells.map((cell, i) =>
                          i === 0 ? { ...cell, table: tbl } : cell,
                        ),
                      })),
                      posFields: c.posFields.map((p) => ({
                        ...p,
                        parts: p.parts.map((pt) => ({ ...pt, table: tbl })),
                      })),
                    }));
                  }}
                >
                  <option value="">-- select --</option>
                  {(formOptions[config.masterTable] || formNames).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.form}
                    onChange={(e) => updateColumn(idx, 'form', e.target.value)}
                  >
                    <option value="">-- select --</option>
                    {formNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
              ))}
            </tr>
            <tr>
              <td>Type</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterType}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, masterType: e.target.value }))
                  }
                >
                  <option value="single">Single</option>
                  <option value="multi">Multi</option>
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.type}
                    onChange={(e) => updateColumn(idx, 'type', e.target.value)}
                  >
                    <option value="single">Single</option>
                    <option value="multi">Multi</option>
                  </select>
                </td>
              ))}
            </tr>
            <tr>
              <td>Position</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterPosition}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, masterPosition: e.target.value }))
                  }
                >
                  <option value="top_row">top_row</option>
                  <option value="upper_left">upper_left</option>
                  <option value="upper_right">upper_right</option>
                  <option value="left">left</option>
                  <option value="right">right</option>
                  <option value="lower_left">lower_left</option>
                  <option value="lower_right">lower_right</option>
                  <option value="bottom_row">bottom_row</option>
                  <option value="hidden">hidden</option>
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.position}
                    onChange={(e) => updateColumn(idx, 'position', e.target.value)}
                  >
                    <option value="top_row">top_row</option>
                    <option value="upper_left">upper_left</option>
                    <option value="upper_right">upper_right</option>
                    <option value="left">left</option>
                    <option value="right">right</option>
                    <option value="lower_left">lower_left</option>
                    <option value="lower_right">lower_right</option>
                    <option value="bottom_row">bottom_row</option>
                    <option value="hidden">hidden</option>
                 </select>
                </td>
              ))}
            </tr>
            <tr>
              <td>View</td>
              <td style={{ padding: '4px' }}>
                <select
                  value={config.masterView}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, masterView: e.target.value }))
                  }
                >
                  <option value="fitted">Fitted</option>
                  <option value="row">Row</option>
                  <option value="table">Table</option>
                </select>
              </td>
              {config.tables.map((t, idx) => (
                <td key={idx} style={{ padding: '4px' }}>
                  <select
                    value={t.view || 'fitted'}
                    onChange={(e) => updateColumn(idx, 'view', e.target.value)}
                  >
                    <option value="fitted">Fitted</option>
                    <option value="row">Row</option>
                    <option value="table">Table</option>
                  </select>
                </td>
              ))}
            </tr>
            {config.calcFields.map((row, rIdx) => (
              <tr key={row.name || rIdx}>
                <td>
                  {row.name || `Map${rIdx + 1}`}{' '}
                  <button onClick={() => removeCalc(rIdx)}>x</button>
                </td>
                {row.cells.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '4px' }}>
                    <select
                      value={cell.agg}
                      onChange={(e) => updateCalc(rIdx, cIdx, 'agg', e.target.value)}
                    >
                      <option value="">-- none --</option>
                      <option value="SUM">SUM</option>
                      <option value="AVG">AVG</option>
                    </select>
                    <select
                      value={cell.field}
                      onChange={(e) => updateCalc(rIdx, cIdx, 'field', e.target.value)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      <option value="">-- field --</option>
                      {(tableColumns[cIdx === 0 ? config.masterTable : config.tables[cIdx - 1]?.table] || []).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
              <tr>
                <td>
                  <button onClick={handleAddCalc}>Add Mapping</button>
                </td>
              </tr>
            </tbody>
            </table>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>POS-only Fields</h3>
          {config.posFields.map((f, idx) => (
            <div key={idx} style={{ marginBottom: '0.5rem' }}>
              <strong>{f.name}</strong>
              {f.parts.map((p, pIdx) => (
                <span key={pIdx} style={{ marginLeft: '0.5rem' }}>
                  {pIdx > 0 && (
                    <select
                      value={p.agg}
                      onChange={(e) => updatePos(idx, pIdx, 'agg', e.target.value)}
                      style={{ marginRight: '0.25rem' }}
                    >
                      <option value="=">=</option>
                      <option value="+">+</option>
                      <option value="-">-</option>
                      <option value="*">*</option>
                      <option value="/">/</option>
                      <option value="SUM">SUM</option>
                      <option value="AVG">AVG</option>
                    </select>
                  )}
                  <select
                    value={p.field}
                    onChange={(e) => updatePos(idx, pIdx, 'field', e.target.value)}
                  >
                    <option value="">-- field --</option>
                    {(tableColumns[config.masterTable] || []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => removePosPart(idx, pIdx)}>x</button>
                </span>
              ))}
              <button onClick={() => addPosPart(idx)} style={{ marginLeft: '0.5rem' }}>
                Add field
              </button>
              <button onClick={() => removePos(idx)} style={{ marginLeft: '0.5rem' }}>
                Remove
              </button>
            </div>
          ))}
          <button onClick={handleAddPos}>Add POS Field</button>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Status Mapping</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Status table</span>
              <select
                value={config.statusField.table}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    statusField: { ...c.statusField, table: e.target.value },
                  }))
                }
              >
                <option value="">-- select table --</option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Status field</span>
              <select
                value={config.statusField.field}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    statusField: { ...c.statusField, field: e.target.value },
                  }))
                }
              >
                <option value="">-- status field --</option>
                {(tableColumns[config.masterTable] || []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Created value</span>
              <select
                value={config.statusField.created}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    statusField: { ...c.statusField, created: e.target.value },
                  }))
                }
              >
                <option value="">-- Created --</option>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Before post value</span>
              <select
                value={config.statusField.beforePost}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    statusField: { ...c.statusField, beforePost: e.target.value },
                  }))
                }
              >
                <option value="">-- Before Post --</option>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Posted value</span>
              <select
                value={config.statusField.posted}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    statusField: { ...c.statusField, posted: e.target.value },
                  }))
                }
              >
                <option value="">-- Posted --</option>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Actions</h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleImport}>Import Defaults</button>
            <button onClick={handleSave}>Save</button>
          </div>
        </section>
      </div>
    </div>
  );
}
