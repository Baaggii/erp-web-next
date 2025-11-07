import React, { useEffect, useState, useMemo, useContext } from 'react';
import { useModules, refreshModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { debugLog } from '../utils/debug.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import I18nContext from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';

const POS_API_FIELDS = [
  { key: 'totalAmount', label: 'Total amount' },
  { key: 'totalVAT', label: 'Total VAT' },
  { key: 'totalCityTax', label: 'Total city tax' },
  { key: 'customerTin', label: 'Customer TIN' },
  { key: 'consumerNo', label: 'Consumer number' },
  { key: 'taxType', label: 'Tax type' },
  { key: 'lotNo', label: 'Lot number (pharmacy)' },
];

function normalizeFormConfig(info = {}) {
  const toArray = (value) => (Array.isArray(value) ? [...value] : []);
  const toObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  const toString = (value) => (typeof value === 'string' ? value : '');
  const temporaryFlag = Boolean(
    info.supportsTemporarySubmission ??
      info.allowTemporarySubmission ??
      info.supportsTemporary ??
      false,
  );

  const allowedBranches = toArray(info.allowedBranches).map((v) => String(v));
  const allowedDepartments = toArray(info.allowedDepartments).map((v) => String(v));
  const allowedUserRights = toArray(info.allowedUserRights).map((v) => String(v));
  const allowedWorkplaces = toArray(info.allowedWorkplaces).map((v) => String(v));
  const temporaryAllowedBranches = toArray(info.temporaryAllowedBranches).map((v) =>
    String(v),
  );
  const temporaryAllowedDepartments = toArray(info.temporaryAllowedDepartments).map((v) =>
    String(v),
  );
  const temporaryAllowedUserRights = toArray(info.temporaryAllowedUserRights).map((v) =>
    String(v),
  );
  const temporaryAllowedWorkplaces = toArray(info.temporaryAllowedWorkplaces).map((v) =>
    String(v),
  );

  return {
    visibleFields: toArray(info.visibleFields),
    requiredFields: toArray(info.requiredFields),
    defaultValues: toObject(info.defaultValues),
    editableDefaultFields: toArray(info.editableDefaultFields),
    editableFields:
      info.editableFields === undefined ? [] : toArray(info.editableFields),
    userIdFields: toArray(info.userIdFields),
    branchIdFields: toArray(info.branchIdFields),
    departmentIdFields: toArray(info.departmentIdFields),
    companyIdFields: toArray(info.companyIdFields),
    dateField: toArray(info.dateField),
    emailField: toArray(info.emailField),
    imagenameField: toArray(info.imagenameField),
    imageIdField: toString(info.imageIdField),
    imageFolder: toString(info.imageFolder),
    printEmpField: toArray(info.printEmpField),
    printCustField: toArray(info.printCustField),
    totalCurrencyFields: toArray(info.totalCurrencyFields),
    totalAmountFields: toArray(info.totalAmountFields),
    signatureFields: toArray(info.signatureFields),
    headerFields: toArray(info.headerFields),
    mainFields: toArray(info.mainFields),
    footerFields: toArray(info.footerFields),
    viewSource: toObject(info.viewSource),
    transactionTypeField: toString(info.transactionTypeField),
    transactionTypeValue: toString(info.transactionTypeValue),
    detectFields: toArray(info.detectFields),
    allowedBranches,
    allowedDepartments,
    allowedUserRights,
    allowedWorkplaces,
    temporaryAllowedBranches,
    temporaryAllowedDepartments,
    temporaryAllowedUserRights,
    temporaryAllowedWorkplaces,
    procedures: toArray(info.procedures),
    temporaryProcedures: toArray(info.temporaryProcedures),
    supportsTemporarySubmission: temporaryFlag,
    allowTemporarySubmission: temporaryFlag,
    posApiEnabled: Boolean(info.posApiEnabled),
    posApiType: toString(info.posApiType),
    posApiMapping: toObject(info.posApiMapping),
  };
}

export default function FormsManagement() {
  const { t } = useContext(I18nContext);
  const { addToast } = useToast();
  const { session, permissions, company } = useContext(AuthContext);
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [names, setNames] = useState([]);
  const [name, setName] = useState('');
  const [moduleKey, setModuleKey] = useState('');
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [userRights, setUserRights] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [txnTypes, setTxnTypes] = useState([]);
  const [columns, setColumns] = useState([]);
  const [views, setViews] = useState([]);
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [branchCfg, setBranchCfg] = useState({ idField: null, displayFields: [] });
  const [deptCfg, setDeptCfg] = useState({ idField: null, displayFields: [] });
  const [userRightCfg, setUserRightCfg] = useState({ idField: null, displayFields: [] });
  const [workplaceCfg, setWorkplaceCfg] = useState({ idField: null, displayFields: [] });
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState('');
  const generalConfig = useGeneralConfig();
  const modules = useModules();
  const procMap = useHeaderMappings(procedureOptions);
  const [isDefault, setIsDefault] = useState(false);
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  if (!hasAdmin) {
    return <Navigate to="/" replace />;
  }
  function getProcLabel(name) {
    return generalConfig.general?.procLabels?.[name] || procMap[name] || name;
  }
  useEffect(() => {
    debugLog('Component mounted: FormsManagement');
  }, []);

  const [config, setConfig] = useState(() => normalizeFormConfig());

  useEffect(() => {
    fetch('/api/transaction_forms', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isDefault: true }))
      .then((data) => {
        const arr = [];
        Object.entries(data || {}).forEach(([n, info]) => {
          if (n === 'isDefault' || !info || !info.table) return;
          arr.push({
            key: `${info.table}::${n}`,
            name: n,
            table: info.table,
            moduleKey: info.moduleKey || '',
            config: info,
          });
        });
        setSavedConfigs(arr);
        if (data && Object.prototype.hasOwnProperty.call(data, 'isDefault')) {
          setIsDefault(!!data.isDefault);
        }
      })
      .catch(() => {
        setSavedConfigs([]);
        setIsDefault(true);
      });
  }, []);

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

  const fieldColumnStyle = useMemo(
    () => ({
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      minWidth: '220px',
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

  function handleSelectExisting(e) {
    const key = e.target.value;
    setSelectedConfig(key);
    if (!key) return;
    const cfg = savedConfigs.find((c) => c.key === key);
    if (!cfg) return;
    setTable(cfg.table);
    setName(cfg.name);
    setModuleKey(cfg.moduleKey || '');
    const info = cfg.config || {};
    setConfig(normalizeFormConfig(info));
    setNames([cfg.name]);
    fetch(`/api/tables/${encodeURIComponent(cfg.table)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
  }

    useEffect(() => {
      const procPrefix = generalConfig?.general?.reportProcPrefix || '';
      const viewPrefix = generalConfig?.general?.reportViewPrefix || '';

      fetch('/api/tables', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setTables(Array.isArray(data) ? data : []))
        .catch(() => setTables([]));

      fetch(
        `/api/views${viewPrefix ? `?prefix=${encodeURIComponent(viewPrefix)}` : ''}`,
        { credentials: 'include' },
      )
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setViews(
            Array.isArray(data)
              ? viewPrefix
                ? data.filter((v) => String(v).includes(viewPrefix))
                : data
              : [],
          ),
        )
        .catch(() => setViews([]));

      fetch('/api/tables/code_branches?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setBranches(data.rows || []))
        .catch(() => setBranches([]));

      fetch('/api/tables/code_department?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setDepartments(data.rows || []))
        .catch(() => setDepartments([]));

      fetch('/api/tables/user_levels?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setUserRights(data.rows || []))
        .catch(() => setUserRights([]));

      fetch('/api/tables/code_workplace?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setWorkplaces(data.rows || []))
        .catch(() => setWorkplaces([]));

      fetch('/api/tables/code_transaction?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setTxnTypes(data.rows || []))
        .catch(() => setTxnTypes([]));

      fetch('/api/display_fields?table=code_branches', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
        .then(setBranchCfg)
        .catch(() => setBranchCfg({ idField: null, displayFields: [] }));

      fetch('/api/display_fields?table=code_department', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
        .then(setDeptCfg)
        .catch(() => setDeptCfg({ idField: null, displayFields: [] }));

      fetch('/api/display_fields?table=user_levels', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
        .then(setUserRightCfg)
        .catch(() => setUserRightCfg({ idField: null, displayFields: [] }));

      fetch('/api/display_fields?table=code_workplace', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
        .then(setWorkplaceCfg)
        .catch(() => setWorkplaceCfg({ idField: null, displayFields: [] }));

      fetch(
        `/api/procedures${
          procPrefix ? `?prefix=${encodeURIComponent(procPrefix)}` : ''
        }`,
        { credentials: 'include' },
      )
        .then((res) => (res.ok ? res.json() : { procedures: [] }))
        .then((data) =>
          setProcedureOptions(
            (data.procedures || []).filter((p) => {
              const low = String(p).toLowerCase();
              return !procPrefix || low.includes(procPrefix.toLowerCase());
            }),
          ),
        )
        .catch(() => setProcedureOptions([]));
    }, [generalConfig?.general?.reportProcPrefix, generalConfig?.general?.reportViewPrefix]);

  useEffect(() => {
    if (!table) return;
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    const params = new URLSearchParams({ table, moduleKey });
    fetch(`/api/transaction_forms?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isDefault: true }))
      .then((data) => {
        setIsDefault(!!data.isDefault);
        const filtered = {};
        Object.entries(data).forEach(([n, info]) => {
          if (n === 'isDefault' || !info || info.moduleKey !== moduleKey) return;
          filtered[n] = info;
        });
        setNames(Object.keys(filtered));
        if (filtered[name]) {
          setModuleKey(filtered[name].moduleKey || '');
          setConfig(normalizeFormConfig(filtered[name]));
        } else {
          setName('');
          setConfig(normalizeFormConfig());
        }
      })
      .catch(() => {
        setIsDefault(true);
        setNames([]);
        setName('');
        setConfig(normalizeFormConfig());
        setModuleKey('');
      });
  }, [table, moduleKey]);

  useEffect(() => {
    if (!table || !name || !names.includes(name)) return;
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { isDefault: true }))
      .then((cfg) => {
        setIsDefault(!!cfg.isDefault);
        setModuleKey(cfg.moduleKey || '');
        setConfig(normalizeFormConfig(cfg));
      })
      .catch(() => {
        setIsDefault(true);
        setConfig(normalizeFormConfig());
        setModuleKey('');
      });
  }, [table, name, names]);

  // If a user selects a predefined transaction name, the associated module
  // parent key will be applied automatically based on the stored
  // configuration retrieved above. The module slug and sidebar/header flags
  // were previously set here but have been removed as they are no longer
  // managed from this page.

  function toggleVisible(field) {
    setConfig((c) => {
      const vis = new Set(c.visibleFields);
      vis.has(field) ? vis.delete(field) : vis.add(field);
      return { ...c, visibleFields: Array.from(vis) };
    });
  }

  function toggleRequired(field) {
    setConfig((c) => {
      const req = new Set(c.requiredFields);
      req.has(field) ? req.delete(field) : req.add(field);
      return { ...c, requiredFields: Array.from(req) };
    });
  }

  function changeDefault(field, value) {
    setConfig((c) => ({
      ...c,
      defaultValues: { ...c.defaultValues, [field]: value },
    }));
  }

  function toggleEditable(field) {
    setConfig((c) => {
      const set = new Set(c.editableDefaultFields);
      set.has(field) ? set.delete(field) : set.add(field);
      const set2 = new Set(c.editableFields);
      set2.has(field) ? set2.delete(field) : set2.add(field);
      return { ...c, editableDefaultFields: Array.from(set), editableFields: Array.from(set2) };
    });
  }

  function toggleFieldList(field, key) {
    setConfig((c) => {
      const set = new Set(c[key]);
      set.has(field) ? set.delete(field) : set.add(field);
      return { ...c, [key]: Array.from(set) };
    });
  }

  function updatePosApiMapping(field, value) {
    setConfig((c) => {
      const next = { ...(c.posApiMapping || {}) };
      if (!value) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return { ...c, posApiMapping: next };
    });
  }

  async function handleSave() {
    if (!name) {
      alert('Please enter transaction name');
      return;
    }
    const normalizeIdList = (list) =>
      Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((value) => {
                  if (value === undefined || value === null) return null;
                  const num = Number(value);
                  if (!Number.isNaN(num)) return num;
                  const str = String(value).trim();
                  return str ? str : null;
                })
                .filter((val) => val !== null),
            ),
          )
        : [];
    const normalizeProcedureList = (list) =>
      Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((value) => {
                  if (typeof value === 'string') return value.trim();
                  if (value === undefined || value === null) return '';
                  return String(value).trim();
                })
                .filter((val) => val),
            ),
          )
        : [];
    const cfg = {
      ...config,
      moduleKey,
      allowedBranches: normalizeIdList(config.allowedBranches),
      allowedDepartments: normalizeIdList(config.allowedDepartments),
      allowedUserRights: normalizeIdList(config.allowedUserRights),
      allowedWorkplaces: normalizeIdList(config.allowedWorkplaces),
      temporaryAllowedBranches: normalizeIdList(config.temporaryAllowedBranches),
      temporaryAllowedDepartments: normalizeIdList(config.temporaryAllowedDepartments),
      temporaryAllowedUserRights: normalizeIdList(config.temporaryAllowedUserRights),
      temporaryAllowedWorkplaces: normalizeIdList(config.temporaryAllowedWorkplaces),
      procedures: normalizeProcedureList(config.procedures),
      temporaryProcedures: normalizeProcedureList(config.temporaryProcedures),
      transactionTypeValue: config.transactionTypeValue
        ? String(config.transactionTypeValue)
        : '',
    };
    const temporaryFlag = Boolean(
      config.supportsTemporarySubmission ??
        config.allowTemporarySubmission ??
        false,
    );
    cfg.allowTemporarySubmission = temporaryFlag;
    cfg.supportsTemporarySubmission = temporaryFlag;
    if (cfg.transactionTypeField && cfg.transactionTypeValue) {
      cfg.defaultValues = {
        ...cfg.defaultValues,
        [cfg.transactionTypeField]: cfg.transactionTypeValue,
      };
    }
    if (isDefault) {
      try {
        const resImport = await fetch(
          `/api/config/import?companyId=${encodeURIComponent(company ?? '')}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ files: ['transactionForms.json'] }),
          },
        );
        if (!resImport.ok) throw new Error('import failed');
        setIsDefault(false);
      } catch (err) {
        addToast(`Import failed: ${err.message}`, 'error');
        return;
      }
    }
    const res = await fetch('/api/transaction_forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        table,
        name,
        config: cfg,
      }),
    });
    if (res.ok) {
      refreshTxnModules();
      refreshModules();
      addToast('Saved', 'success');
      if (!names.includes(name)) setNames((n) => [...n, name]);
      const key = `${table}::${name}`;
      const info = {
        key,
        name,
        table,
        moduleKey: cfg.moduleKey || '',
        config: cfg,
      };
      setSavedConfigs((list) => {
        const idx = list.findIndex((c) => c.key === key);
        if (idx >= 0) {
          const copy = [...list];
          copy[idx] = info;
          return copy;
        }
        return [...list, info];
      });
      setSelectedConfig(key);
      setIsDefault(false);
    } else {
      addToast('Save failed', 'error');
    }
  }

  async function handleDelete() {
    if (!table || !name) return;
    if (!window.confirm('Delete transaction configuration?')) return;
    try {
      const res = await fetch(
        `/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error('failed');
      addToast('Deleted', 'success');
    } catch {
      addToast('Delete failed', 'error');
      return;
    }
    refreshTxnModules();
    refreshModules();
    setNames((n) => n.filter((x) => x !== name));
    setSavedConfigs((list) =>
      list.filter((c) => !(c.table === table && c.name === name)),
    );
    setName('');
    setConfig(normalizeFormConfig());
    setModuleKey('');
    setSelectedConfig('');
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
          body: JSON.stringify({ files: ['transactionForms.json'] }),
        },
      );
      if (!res.ok) throw new Error('failed');
      refreshTxnModules();
      refreshModules();
      const allRes = await fetch('/api/transaction_forms', { credentials: 'include' });
      if (allRes.ok) {
        const allData = await allRes.json();
        if (Object.prototype.hasOwnProperty.call(allData, 'isDefault')) {
          setIsDefault(!!allData.isDefault);
        }
        const arr = [];
        Object.entries(allData || {}).forEach(([n, info]) => {
          if (n === 'isDefault' || !info || !info.table) return;
          arr.push({
            key: `${info.table}::${n}`,
            name: n,
            table: info.table,
            moduleKey: info.moduleKey || '',
            config: info,
          });
        });
        setSavedConfigs(arr);
      }
      if (table) {
        const params = new URLSearchParams({ table, moduleKey });
        const resCfg = await fetch(`/api/transaction_forms?${params.toString()}`, {
          credentials: 'include',
        });
        const data = resCfg.ok ? await resCfg.json() : { isDefault: true };
        setIsDefault(!!data.isDefault);
        const filtered = {};
        Object.entries(data).forEach(([n, info]) => {
          if (n === 'isDefault' || !info || info.moduleKey !== moduleKey) return;
          filtered[n] = info;
        });
        const formNames = Object.keys(filtered);
        setNames(formNames);
        if (filtered[name]) {
          setConfig(normalizeFormConfig(filtered[name]));
        } else {
          setName('');
          setConfig(normalizeFormConfig());
        }
      }
      addToast('Imported', 'success');
    } catch (err) {
      addToast(`Import failed: ${err.message}`, 'error');
    }
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <h2>{t('settings_forms_management', 'Forms Management')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Configuration Selection</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Existing configuration</span>
              <select value={selectedConfig} onChange={handleSelectExisting}>
                <option value="">-- select configuration --</option>
                {savedConfigs.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Module</span>
              <select
                value={moduleKey}
                onChange={(e) => {
                  setSelectedConfig('');
                  setModuleKey(e.target.value);
                }}
              >
                <option value="">-- select module --</option>
                {modules.map((m) => (
                  <option key={m.module_key} value={m.module_key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={fieldColumnStyle}>
              <span style={{ fontWeight: 600 }}>Table</span>
              <select
                value={table}
                onChange={(e) => {
                  setSelectedConfig('');
                  setTable(e.target.value);
                }}
              >
                <option value="">-- select table --</option>
                {tables.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {table && (
          <>
            <section style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Transaction Details</h3>
              <div style={controlGroupStyle}>
                <label style={fieldColumnStyle}>
                  <span style={{ fontWeight: 600 }}>Transaction name</span>
                  <input
                    type="text"
                    placeholder="Transaction name"
                    value={name}
                    onChange={(e) => {
                      setSelectedConfig('');
                      setName(e.target.value);
                    }}
                  />
                </label>
                {columns.length > 0 && (
                  <label style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Transaction type field</span>
                    <select
                      value={config.transactionTypeField}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, transactionTypeField: e.target.value }))
                      }
                    >
                      <option value="">-- transaction type field --</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {txnTypes.length > 0 && (
                  <label style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Transaction type value</span>
                    <select
                      value={config.transactionTypeValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfig((c) => ({ ...c, transactionTypeValue: val }));
                        const found = txnTypes.find((t) => String(t.UITransType) === val);
                        if (found && found.UITransTypeName) setName(found.UITransTypeName);
                      }}
                    >
                      <option value="">-- select type --</option>
                      {txnTypes.map((t) => (
                        <option key={t.UITransType} value={t.UITransType}>
                          {t.UITransType} - {t.UITransTypeName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label style={fieldColumnStyle}>
                  <span style={{ fontWeight: 600 }}>Image folder</span>
                  <input
                    type="text"
                    placeholder="Image folder"
                    value={config.imageFolder}
                    onChange={(e) => setConfig((c) => ({ ...c, imageFolder: e.target.value }))}
                  />
                </label>
                <div style={{ ...fieldColumnStyle }}>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                    <span>
                      {t(
                        'allow_temporary_submission',
                        'Allow temporary transaction submissions',
                      )}
                    </span>
                  </label>
                  <small style={{ color: '#666' }}>
                    {t(
                      'allow_temporary_submission_hint',
                      'When enabled, users can save drafts that require senior confirmation before posting.',
                    )}
                  </small>
                </div>
              </div>
            </section>

            <section style={sectionStyle}>
              <h3 style={sectionTitleStyle}>POS API</h3>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(config.posApiEnabled)}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, posApiEnabled: e.target.checked }))
                  }
                />
                <span>Enable POSAPI submission</span>
              </label>
              <label style={{ ...fieldColumnStyle }}>
                <span style={{ fontWeight: 600 }}>Receipt type</span>
                <select
                  value={config.posApiType}
                  disabled={!config.posApiEnabled}
                  onChange={(e) => setConfig((c) => ({ ...c, posApiType: e.target.value }))}
                >
                  <option value="">Use default from environment</option>
                  <option value="B2C_RECEIPT">B2C_RECEIPT</option>
                  <option value="B2C_INVOICE">B2C_INVOICE</option>
                  <option value="B2B_INVOICE">B2B_INVOICE</option>
                </select>
              </label>
              <div>
                <strong>Field mapping</strong>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                  Map POSAPI fields to columns in the master transaction table. Leave blank to skip optional fields.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '0.75rem',
                    marginTop: '0.5rem',
                  }}
                >
                  {POS_API_FIELDS.map((field) => {
                    const listId = `posapi-${field.key}-columns`;
                    return (
                      <label key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{field.label}</span>
                        <input
                          type="text"
                          list={listId}
                          value={config.posApiMapping[field.key] || ''}
                          onChange={(e) => updatePosApiMapping(field.key, e.target.value)}
                          placeholder="Column name"
                          disabled={!config.posApiEnabled}
                        />
                        <datalist id={listId}>
                          {columns.map((col) => (
                            <option key={col} value={col} />
                          ))}
                        </datalist>
                      </label>
                    );
                  })}
                </div>
              </div>
            </section>

            <section style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Field Configuration</h3>
              <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead className="sticky-header">
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Visible</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Required</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Default</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Editable</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Detect</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>UserID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>BranchID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>DepartmentID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>CompanyID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Date</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Email</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>ImageName</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>ImageID</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>PrintEmp</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>PrintCust</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>TotalCur</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>TotalAmt</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Signature</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Header</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Main</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Footer</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>View</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr key={col}>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                    {col != null ? col : ''}
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.visibleFields.includes(col)}
                      onChange={() => toggleVisible(col)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.requiredFields.includes(col)}
                      onChange={() => toggleRequired(col)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                    <input
                      type="text"
                      value={config.defaultValues[col] || ''}
                      onChange={(e) => changeDefault(col, e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.editableDefaultFields.includes(col)}
                      onChange={() => toggleEditable(col)}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.detectFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'detectFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.userIdFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'userIdFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.branchIdFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'branchIdFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.departmentIdFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'departmentIdFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.companyIdFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'companyIdFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.dateField.includes(col)}
                      onChange={() => toggleFieldList(col, 'dateField')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.emailField.includes(col)}
                      onChange={() => toggleFieldList(col, 'emailField')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.imagenameField.includes(col)}
                      onChange={() => toggleFieldList(col, 'imagenameField')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="radio"
                      name="imageIdField"
                      checked={config.imageIdField === col}
                      onChange={() =>
                        setConfig((c) => ({
                          ...c,
                          imageIdField: col,
                          imagenameField: c.imagenameField.includes(col)
                            ? c.imagenameField
                            : [...c.imagenameField, col],
                        }))
                      }
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.printEmpField.includes(col)}
                      onChange={() => toggleFieldList(col, 'printEmpField')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.printCustField.includes(col)}
                      onChange={() => toggleFieldList(col, 'printCustField')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.totalCurrencyFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'totalCurrencyFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.totalAmountFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'totalAmountFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.signatureFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'signatureFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.headerFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'headerFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.mainFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'mainFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={config.footerFields.includes(col)}
                      onChange={() => toggleFieldList(col, 'footerFields')}
                    />
                  </td>
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                    <select
                      value={config.viewSource[col] || ''}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          viewSource: { ...c.viewSource, [col]: e.target.value },
                        }))
                      }
                    >
                      <option value="">-- none --</option>
                      {views.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
              </div>
            </section>

            <section style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Access Control</h3>
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
                          onClick={() =>
                            setConfig((c) => ({ ...c, allowedDepartments: [] }))
                          }
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
                        {userRightOptions.map((right) => (
                          <option key={right.value} value={right.value}>
                            {right.label}
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
                          onClick={() =>
                            setConfig((c) => ({ ...c, allowedUserRights: [] }))
                          }
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
                        {workplaceOptions.map((workplace) => (
                          <option key={workplace.value} value={workplace.value}>
                            {workplace.label}
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
                              {getProcLabel(p)}
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
                          {userRightOptions.map((right) => (
                            <option key={right.value} value={right.value}>
                              {right.label}
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
                          {workplaceOptions.map((workplace) => (
                            <option key={workplace.value} value={workplace.value}>
                              {workplace.label}
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
                                {getProcLabel(p)}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section style={sectionStyle}>
              <h3 style={sectionTitleStyle}>Actions</h3>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {name && (
                  <button onClick={handleDelete}>Delete</button>
                )}
                <button onClick={handleImport}>Import Defaults</button>
                <button onClick={handleSave}>Save Configuration</button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
