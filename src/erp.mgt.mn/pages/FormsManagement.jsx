import React, { useEffect, useState } from 'react';
import { useModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { debugLog } from '../utils/debug.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings from '../hooks/useHeaderMappings.js';
import Modal from '../components/Modal.jsx';

export default function FormsManagement() {
  const [tables, setTables] = useState([]);
  const [table, setTable] = useState('');
  const [names, setNames] = useState([]);
  const [name, setName] = useState('');
  const [dupConfigs, setDupConfigs] = useState({});
  const [moduleKey, setModuleKey] = useState('');
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [txnTypes, setTxnTypes] = useState([]);
  const [columns, setColumns] = useState([]);
  const [views, setViews] = useState([]);
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [displayConfigs, setDisplayConfigs] = useState({});
  const [displayLoaded, setDisplayLoaded] = useState(false);
  const [tableDisplayCfg, setTableDisplayCfg] = useState(null);
  const [showDisplayModal, setShowDisplayModal] = useState(false);
  const [missingTable, setMissingTable] = useState('');
  const generalConfig = useGeneralConfig();
  const modules = useModules();
  const procMap = useHeaderMappings(procedureOptions);
  function getProcLabel(name) {
    return generalConfig.general?.procLabels?.[name] || procMap[name] || name;
  }
  useEffect(() => {
    debugLog('Component mounted: FormsManagement');
  }, []);
  const [config, setConfig] = useState({
    visibleFields: [],
    requiredFields: [],
    defaultValues: {},
    editableDefaultFields: [],
    editableFields: [],
    userIdFields: [],
    branchIdFields: [],
    departmentIdFields: [],
    companyIdFields: [],
    dateField: [],
    emailField: [],
    imagenameField: [],
    imageIdField: '',
    imageFolder: '',
    printEmpField: [],
    printCustField: [],
    totalCurrencyFields: [],
    totalAmountFields: [],
    signatureFields: [],
    headerFields: [],
    mainFields: [],
    footerFields: [],
    viewSource: {},
    transactionTypeField: '',
    transactionTypeValue: '',
    allowedBranches: [],
    allowedDepartments: [],
    procedures: [],
  });

    useEffect(() => {
      const procPrefix = generalConfig?.general?.reportProcPrefix || '';
      const viewPrefix = generalConfig?.general?.reportViewPrefix || '';

      fetch('/api/tables', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setTables(
            Array.isArray(data)
              ? data.filter((t) => String(t).startsWith('transactions_'))
              : [],
          ),
        )
        .catch(() => setTables([]));

      fetch('/api/display_fields', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : {}))
        .then((cfg) => {
          setDisplayConfigs(cfg || {});
          setDisplayLoaded(true);
        })
        .catch(() => {
          setDisplayConfigs({});
          setDisplayLoaded(true);
        });

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

      fetch('/api/tables/code_transaction?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setTxnTypes(data.rows || []))
        .catch(() => setTxnTypes([]));

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
    if (!table || !displayLoaded) {
      setTableDisplayCfg(null);
      return;
    }

    const cfg = displayConfigs[table];
    if (cfg && Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) {
      setTableDisplayCfg(cfg);
    } else {
      setTableDisplayCfg(null);
      setMissingTable(table);
      setShowDisplayModal(true);
      return;
    }

    const lookupTables = ['code_branches', 'code_department'];
    if (txnTypes.length > 0) lookupTables.push('code_transaction');
    for (const t of lookupTables) {
      const c = displayConfigs[t];
      if (!c || !Array.isArray(c.displayFields) || c.displayFields.length === 0) {
        setMissingTable(t);
        setShowDisplayModal(true);
        return;
      }
    }

    setShowDisplayModal(false);
    setMissingTable('');
  }, [table, displayConfigs, displayLoaded, txnTypes.length]);

  useEffect(() => {
    if (!table || !tableDisplayCfg) {
      setColumns([]);
      setNames([]);
      setDupConfigs({});
      return;
    }
    fetch(`/api/tables/${encodeURIComponent(table)}/columns`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => setColumns(cols.map((c) => c.name || c)))
      .catch(() => setColumns([]));
    const params = new URLSearchParams({ table, moduleKey });
    fetch(`/api/transaction_forms?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        const filtered = {};
        Object.entries(data).forEach(([n, info]) => {
          if (!info || info.moduleKey !== moduleKey) return;
          filtered[n] = info;
        });
        setNames(Object.keys(filtered));
        setDupConfigs(filtered);
        if (filtered[name]) {
          setModuleKey(filtered[name].moduleKey || '');
          setConfig({
            visibleFields: filtered[name].visibleFields || [],
            requiredFields: filtered[name].requiredFields || [],
            defaultValues: filtered[name].defaultValues || {},
            editableDefaultFields: filtered[name].editableDefaultFields || [],
            editableFields: filtered[name].editableFields || [],
            userIdFields: filtered[name].userIdFields || [],
            branchIdFields: filtered[name].branchIdFields || [],
            departmentIdFields: filtered[name].departmentIdFields || [],
            companyIdFields: filtered[name].companyIdFields || [],
            dateField: filtered[name].dateField || [],
            emailField: filtered[name].emailField || [],
            imagenameField: filtered[name].imagenameField || [],
            imageIdField: filtered[name].imageIdField || '',
            imageFolder: filtered[name].imageFolder || '',
            printEmpField: filtered[name].printEmpField || [],
            printCustField: filtered[name].printCustField || [],
            totalCurrencyFields: filtered[name].totalCurrencyFields || [],
            totalAmountFields: filtered[name].totalAmountFields || [],
            signatureFields: filtered[name].signatureFields || [],
            headerFields: filtered[name].headerFields || [],
            mainFields: filtered[name].mainFields || [],
            footerFields: filtered[name].footerFields || [],
            viewSource: filtered[name].viewSource || {},
            transactionTypeField: filtered[name].transactionTypeField || '',
            transactionTypeValue: filtered[name].transactionTypeValue || '',
            allowedBranches: (filtered[name].allowedBranches || []).map(String),
            allowedDepartments: (filtered[name].allowedDepartments || []).map(String),
            procedures: filtered[name].procedures || [],
          });
        } else {
          setName('');
          setConfig({
            visibleFields: [],
            requiredFields: [],
            defaultValues: {},
            editableDefaultFields: [],
            editableFields: [],
            userIdFields: [],
            branchIdFields: [],
            departmentIdFields: [],
            companyIdFields: [],
            dateField: [],
            emailField: [],
            imagenameField: [],
            imageIdField: '',
            imageFolder: '',
            printEmpField: [],
            printCustField: [],
            totalCurrencyFields: [],
            totalAmountFields: [],
            signatureFields: [],
            headerFields: [],
            mainFields: [],
            footerFields: [],
            viewSource: {},
            transactionTypeField: '',
            transactionTypeValue: '',
            allowedBranches: [],
            allowedDepartments: [],
            procedures: [],
          });
        }
      })
      .catch(() => {
        setNames([]);
        setName('');
        setConfig({
          visibleFields: [],
          requiredFields: [],
          defaultValues: {},
          editableDefaultFields: [],
          editableFields: [],
          userIdFields: [],
          branchIdFields: [],
          departmentIdFields: [],
          companyIdFields: [],
          dateField: [],
          emailField: [],
          imagenameField: [],
          imageIdField: '',
          imageFolder: '',
          printEmpField: [],
          printCustField: [],
          totalCurrencyFields: [],
          totalAmountFields: [],
          signatureFields: [],
          headerFields: [],
          mainFields: [],
          footerFields: [],
          viewSource: {},
          transactionTypeField: '',
          transactionTypeValue: '',
          allowedBranches: [],
          allowedDepartments: [],
          procedures: [],
        });
        setModuleKey('');
      });
  }, [table, moduleKey, tableDisplayCfg]);

  useEffect(() => {
    if (!table || !tableDisplayCfg || !name || !names.includes(name)) return;
    fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => {
        setModuleKey(cfg.moduleKey || '');
        setConfig({
          visibleFields: cfg.visibleFields || [],
          requiredFields: cfg.requiredFields || [],
          defaultValues: cfg.defaultValues || {},
          editableDefaultFields: cfg.editableDefaultFields || [],
          editableFields: cfg.editableFields || [],
          userIdFields: cfg.userIdFields || [],
          branchIdFields: cfg.branchIdFields || [],
          departmentIdFields: cfg.departmentIdFields || [],
          companyIdFields: cfg.companyIdFields || [],
          dateField: cfg.dateField || [],
          emailField: cfg.emailField || [],
          imagenameField: cfg.imagenameField || [],
          imageIdField: cfg.imageIdField || '',
          imageFolder: cfg.imageFolder || '',
          printEmpField: cfg.printEmpField || [],
          printCustField: cfg.printCustField || [],
          totalCurrencyFields: cfg.totalCurrencyFields || [],
          totalAmountFields: cfg.totalAmountFields || [],
          signatureFields: cfg.signatureFields || [],
          headerFields: cfg.headerFields || [],
          mainFields: cfg.mainFields || [],
          footerFields: cfg.footerFields || [],
          viewSource: cfg.viewSource || {},
          transactionTypeField: cfg.transactionTypeField || '',
          transactionTypeValue: cfg.transactionTypeValue || '',
          allowedBranches: (cfg.allowedBranches || []).map(String),
          allowedDepartments: (cfg.allowedDepartments || []).map(String),
          procedures: cfg.procedures || [],
        });
      })
      .catch(() => {
        setConfig({
          visibleFields: [],
          requiredFields: [],
          defaultValues: {},
          editableDefaultFields: [],
          editableFields: [],
          userIdFields: [],
          branchIdFields: [],
          departmentIdFields: [],
          companyIdFields: [],
          dateField: [],
          emailField: [],
          imagenameField: [],
          imageIdField: '',
          imageFolder: '',
          printEmpField: [],
          printCustField: [],
          totalCurrencyFields: [],
          totalAmountFields: [],
          signatureFields: [],
          headerFields: [],
          mainFields: [],
          footerFields: [],
          viewSource: {},
          transactionTypeField: '',
          transactionTypeValue: '',
          allowedBranches: [],
          allowedDepartments: [],
          procedures: [],
        });
        setModuleKey('');
      });
  }, [table, name, names, tableDisplayCfg]);

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

  async function handleSave() {
    if (!name) {
      alert('Please enter transaction name');
      return;
    }
    const cfg = {
      ...config,
      moduleKey,
      allowedBranches: config.allowedBranches.map((b) => String(b)),
      allowedDepartments: config.allowedDepartments.map((d) => String(d)),
      transactionTypeValue: config.transactionTypeValue
        ? String(config.transactionTypeValue)
        : '',
    };
    if (cfg.transactionTypeField && cfg.transactionTypeValue) {
      cfg.defaultValues = {
        ...cfg.defaultValues,
        [cfg.transactionTypeField]: cfg.transactionTypeValue,
      };
    }
    await fetch('/api/transaction_forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        table,
        name,
        config: cfg,
      }),
    });
    refreshTxnModules();
    alert('Saved');
    if (!names.includes(name)) setNames((n) => [...n, name]);
  }

  async function handleDelete() {
    if (!table || !name) return;
    if (!window.confirm('Delete transaction configuration?')) return;
    await fetch(`/api/transaction_forms?table=${encodeURIComponent(table)}&name=${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    refreshTxnModules();
    setNames((n) => n.filter((x) => x !== name));
    setName('');
    setConfig({
      visibleFields: [],
      requiredFields: [],
      defaultValues: {},
      editableDefaultFields: [],
      userIdFields: [],
      branchIdFields: [],
      companyIdFields: [],
      dateField: [],
      emailField: [],
      imagenameField: [],
      imageIdField: '',
      imageFolder: '',
      printEmpField: [],
      printCustField: [],
      totalCurrencyFields: [],
      totalAmountFields: [],
      signatureFields: [],
      headerFields: [],
      mainFields: [],
      footerFields: [],
      viewSource: {},
      transactionTypeField: '',
      transactionTypeValue: '',
      allowedBranches: [],
      allowedDepartments: [],
      procedures: [],
    });
    setModuleKey('');
  }

  function handleDuplicate(nameToCopy) {
    const cfg = dupConfigs[nameToCopy];
    if (!cfg) return;
    setConfig({
      visibleFields: cfg.visibleFields || [],
      requiredFields: cfg.requiredFields || [],
      defaultValues: cfg.defaultValues || {},
      editableDefaultFields: cfg.editableDefaultFields || [],
      userIdFields: cfg.userIdFields || [],
      branchIdFields: cfg.branchIdFields || [],
      companyIdFields: cfg.companyIdFields || [],
      dateField: cfg.dateField || [],
      emailField: cfg.emailField || [],
      imagenameField: cfg.imagenameField || [],
      imageIdField: cfg.imageIdField || '',
      imageFolder: cfg.imageFolder || '',
      printEmpField: cfg.printEmpField || [],
      printCustField: cfg.printCustField || [],
      totalCurrencyFields: cfg.totalCurrencyFields || [],
      totalAmountFields: cfg.totalAmountFields || [],
      signatureFields: cfg.signatureFields || [],
      headerFields: cfg.headerFields || [],
      mainFields: cfg.mainFields || [],
      footerFields: cfg.footerFields || [],
      viewSource: cfg.viewSource || {},
      transactionTypeField: cfg.transactionTypeField || '',
      transactionTypeValue: cfg.transactionTypeValue || '',
      allowedBranches: (cfg.allowedBranches || []).map(String),
      allowedDepartments: (cfg.allowedDepartments || []).map(String),
      procedures: cfg.procedures || [],
    });
  }

  return (
    <div>
      <h2>Маягтын удирдлага</h2>
      <div style={{ marginBottom: '1rem' }}>
        <select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">-- select table --</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {tableDisplayCfg && (
        <div style={{ marginBottom: '1rem' }}>
          <div>
            <strong>ID Field:</strong> {tableDisplayCfg.idField || '(none)'}
          </div>
          <div>
            <strong>Display Fields:</strong>{' '}
            {tableDisplayCfg.displayFields.join(', ')}
          </div>
        </div>
      )}
      {table && tableDisplayCfg && (
        <div>
          <div
            style={{
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              maxWidth: '20rem',
              gap: '0.5rem',
            }}
          >
            <select value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">-- select transaction --</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Transaction name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <select value={moduleKey} onChange={(e) => setModuleKey(e.target.value)}>
              <option value="">-- select module --</option>
              {modules.map((m) => (
                <option key={m.module_key} value={m.module_key}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleDuplicate(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="">Duplicate from existing</option>
              {Object.keys(dupConfigs).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {columns.length > 0 && (
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
            )}
            {txnTypes.length > 0 && displayConfigs.code_transaction && (
              <select
                value={config.transactionTypeValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setConfig((c) => ({ ...c, transactionTypeValue: val }));
                  const cfg = displayConfigs.code_transaction;
                  const idField = cfg.idField;
                  const found = txnTypes.find((t) => String(t[idField]) === val);
                  if (found) {
                    const nameField = cfg.displayFields[0];
                    if (nameField && found[nameField]) setName(found[nameField]);
                  }
                }}
              >
                <option value="">-- select type --</option>
                {txnTypes.map((t) => {
                  const cfg = displayConfigs.code_transaction;
                  const idField = cfg.idField;
                  const labelParts = cfg.displayFields.map((f) => t[f]);
                  const val = t[idField];
                  return (
                    <option key={val} value={val}>
                      {labelParts.filter(Boolean).join(' - ')}
                    </option>
                  );
                })}
              </select>
            )}
            <input
              type="text"
              placeholder="Image folder"
              value={config.imageFolder}
              onChange={(e) =>
                setConfig((c) => ({ ...c, imageFolder: e.target.value }))
              }
            />
            {name && <button onClick={handleDelete}>Delete</button>}
          </div>
          <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead className="sticky-header">
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Visible</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Required</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Default</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Editable</th>
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
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {displayConfigs.code_branches && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Allowed branches:{' '}
                <select
                  multiple
                  size={8}
                  value={config.allowedBranches}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      allowedBranches: Array.from(e.target.selectedOptions, (o) => o.value),
                    }))
                  }
                >
                  {branches.map((b) => {
                    const cfg = displayConfigs.code_branches;
                    const idField = cfg.idField;
                    const labelParts = cfg.displayFields.map((f) => b[f]);
                    const val = b[idField];
                    return (
                      <option key={val} value={val}>
                        {labelParts.filter(Boolean).join(' - ')}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      allowedBranches: branches.map((b) => String(b[displayConfigs.code_branches.idField])),
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
              </label>
            )}
            {displayConfigs.code_department && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Allowed departments:{' '}
                <select
                  multiple
                  size={8}
                  value={config.allowedDepartments}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      allowedDepartments: Array.from(e.target.selectedOptions, (o) => o.value),
                    }))
                  }
                >
                  {departments.map((d) => {
                    const cfg = displayConfigs.code_department;
                    const idField = cfg.idField;
                    const labelParts = cfg.displayFields.map((f) => d[f]);
                    const val = d[idField];
                    return (
                      <option key={val} value={val}>
                        {labelParts.filter(Boolean).join(' - ')}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      allowedDepartments: departments.map((d) => String(d[displayConfigs.code_department.idField])),
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
              </label>
            )}
            {procedureOptions.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Procedures:{' '}
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
              </label>
            )}
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleSave}>Save Configuration</button>
          </div>
        </div>
      )}
      <Modal
        visible={showDisplayModal}
        title="Display Fields Not Configured"
        onClose={() => setShowDisplayModal(false)}
      >
        <p>No display field configuration found for {missingTable}.</p>
      </Modal>
    </div>
  );
}
