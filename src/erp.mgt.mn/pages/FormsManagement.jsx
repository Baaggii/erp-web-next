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
  { key: 'branchNo', label: 'Branch number' },
  { key: 'posNo', label: 'POS number' },
  { key: 'merchantTin', label: 'Merchant TIN override' },
  { key: 'districtCode', label: 'District code' },
  { key: 'itemsField', label: 'Items array column' },
  { key: 'paymentsField', label: 'Payments array column' },
  { key: 'receiptsField', label: 'Receipts array column' },
  { key: 'paymentType', label: 'Default payment type column' },
  { key: 'taxTypeField', label: 'Header tax type column' },
  { key: 'classificationCodeField', label: 'Classification code column' },
];

const POS_API_ITEM_FIELDS = [
  { key: 'name', label: 'Item name' },
  { key: 'description', label: 'Item description' },
  { key: 'qty', label: 'Quantity' },
  { key: 'price', label: 'Unit price' },
  { key: 'totalAmount', label: 'Line total amount' },
  { key: 'totalVAT', label: 'Line VAT' },
  { key: 'totalCityTax', label: 'Line city tax' },
  { key: 'taxType', label: 'Line tax type' },
  { key: 'classificationCode', label: 'Classification code' },
  { key: 'taxProductCode', label: 'Tax product code' },
  { key: 'barCode', label: 'Barcode' },
  { key: 'measureUnit', label: 'Measure unit' },
];

const POS_API_PAYMENT_FIELDS = [
  { key: 'type', label: 'Payment type' },
  { key: 'amount', label: 'Amount' },
  { key: 'currency', label: 'Currency' },
  { key: 'method', label: 'Method' },
  { key: 'reference', label: 'Reference number' },
];

const POS_API_RECEIPT_FIELDS = [
  { key: 'totalAmount', label: 'Receipt total amount' },
  { key: 'totalVAT', label: 'Receipt total VAT' },
  { key: 'totalCityTax', label: 'Receipt total city tax' },
  { key: 'taxType', label: 'Receipt tax type' },
  { key: 'items', label: 'Receipt items path' },
  { key: 'payments', label: 'Receipt payments path' },
  { key: 'description', label: 'Receipt description' },
];

function normalizeFormConfig(info = {}) {
  const toArray = (value) => (Array.isArray(value) ? [...value] : []);
  const toObject = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  const toString = (value) => (typeof value === 'string' ? value : '');
  const normalizeInfoMappings = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const normalized = {};
    Object.entries(value).forEach(([endpointId, mapping]) => {
      if (typeof endpointId !== 'string') return;
      const trimmedId = endpointId.trim();
      if (!trimmedId) return;
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
      const normalizedMapping = {};
      Object.entries(mapping).forEach(([field, path]) => {
        if (typeof field !== 'string' || typeof path !== 'string') return;
        const trimmedField = field.trim();
        const trimmedPath = path.trim();
        if (!trimmedField || !trimmedPath) return;
        normalizedMapping[trimmedField] = trimmedPath;
      });
      if (Object.keys(normalizedMapping).length > 0) {
        normalized[trimmedId] = normalizedMapping;
      }
    });
    return normalized;
  };
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
  const procedures = toArray(info.procedures).map((v) => String(v));
  const temporaryProcedures = toArray(info.temporaryProcedures).map((v) => String(v));

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
    procedures,
    temporaryAllowedBranches,
    temporaryAllowedDepartments,
    temporaryAllowedUserRights,
    temporaryAllowedWorkplaces,
    temporaryProcedures,
    supportsTemporarySubmission: temporaryFlag,
    allowTemporarySubmission: temporaryFlag,
    posApiEnabled: Boolean(info.posApiEnabled),
    posApiType: toString(info.posApiType),
    posApiTypeField: toString(info.posApiTypeField),
    posApiEndpointId: toString(info.posApiEndpointId),
    posApiInfoEndpointIds: toArray(
      info.posApiInfoEndpointIds ?? info.infoEndpoints,
    ).map((v) => (typeof v === 'string' ? v : String(v))),
    infoEndpoints: toArray(info.infoEndpoints ?? info.posApiInfoEndpointIds).map((v) =>
      typeof v === 'string' ? v : String(v),
    ),
    fieldsFromPosApi: toArray(info.fieldsFromPosApi).map((v) =>
      typeof v === 'string' ? v : String(v),
    ),
    posApiMapping: toObject(info.posApiMapping),
    infoEndpointMappings: normalizeInfoMappings(info.infoEndpointMappings),
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
  const [posApiEndpoints, setPosApiEndpoints] = useState([]);
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

  const itemFieldMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.itemFields === 'object' &&
    !Array.isArray(config.posApiMapping.itemFields)
      ? config.posApiMapping.itemFields
      : {};
  const paymentFieldMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.paymentFields === 'object' &&
    !Array.isArray(config.posApiMapping.paymentFields)
      ? config.posApiMapping.paymentFields
      : {};
  const receiptFieldMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.receiptFields === 'object' &&
    !Array.isArray(config.posApiMapping.receiptFields)
      ? config.posApiMapping.receiptFields
      : {};
  const infoEndpointMappings =
    config.infoEndpointMappings &&
    typeof config.infoEndpointMappings === 'object' &&
    !Array.isArray(config.infoEndpointMappings)
      ? config.infoEndpointMappings
      : {};

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

  useEffect(() => {
    fetch('/api/posapi/endpoints', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setPosApiEndpoints(data);
        } else if (data && Array.isArray(data.endpoints)) {
          setPosApiEndpoints(data.endpoints);
        } else {
          setPosApiEndpoints([]);
        }
      })
      .catch(() => setPosApiEndpoints([]));
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

  const endpointOptionGroups = useMemo(() => {
    const base = { transaction: [], info: [], admin: [], other: [] };
    if (!Array.isArray(posApiEndpoints)) return base;
    posApiEndpoints.forEach((endpoint) => {
      if (!endpoint || typeof endpoint !== 'object') return;
      const id = typeof endpoint.id === 'string' ? endpoint.id.trim() : '';
      if (!id) return;
      const name = typeof endpoint.name === 'string' ? endpoint.name : '';
      const label = name ? `${id} – ${name}` : id;
      const usage = typeof endpoint.usage === 'string' ? endpoint.usage : 'other';
      const option = {
        value: id,
        label,
        defaultForForm: Boolean(endpoint.defaultForForm),
      };
      if (usage === 'transaction') {
        base.transaction.push(option);
      } else if (usage === 'info') {
        base.info.push(option);
      } else if (usage === 'admin') {
        base.admin.push(option);
      } else {
        base.other.push(option);
      }
    });
    base.transaction.sort((a, b) => a.label.localeCompare(b.label));
    base.info.sort((a, b) => a.label.localeCompare(b.label));
    base.admin.sort((a, b) => a.label.localeCompare(b.label));
    return base;
  }, [posApiEndpoints]);

  const transactionEndpointOptions = endpointOptionGroups.transaction;
  const infoEndpointOptions = endpointOptionGroups.info;

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

  const subsectionTitleStyle = useMemo(
    () => ({
      margin: '0 0 0.5rem',
      fontSize: '1rem',
      fontWeight: 600,
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
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete next[field];
      } else {
        next[field] = trimmed;
      }
      return { ...c, posApiMapping: next };
    });
  }

  function updatePosApiNestedMapping(section, field, value) {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const current = base[section];
      const nested =
        current && typeof current === 'object' && !Array.isArray(current)
          ? { ...current }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete nested[field];
      } else {
        nested[field] = trimmed;
      }
      if (Object.keys(nested).length) {
        base[section] = nested;
      } else {
        delete base[section];
      }
      return { ...c, posApiMapping: base };
    });
  }

  function handleInfoEndpointChange(event) {
    const selected = Array.from(event.target.selectedOptions || [])
      .map((opt) => opt.value)
      .filter((value) => value);
    setConfig((c) => {
      const existingMappings =
        c.infoEndpointMappings && typeof c.infoEndpointMappings === 'object'
          ? { ...c.infoEndpointMappings }
          : {};
      Object.keys(existingMappings).forEach((endpointId) => {
        if (!selected.includes(endpointId)) {
          delete existingMappings[endpointId];
        }
      });
      return {
        ...c,
        posApiInfoEndpointIds: selected,
        infoEndpoints: selected,
        infoEndpointMappings: existingMappings,
      };
    });
  }

  function handleFieldsFromPosApiChange(value) {
    const entries = value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item);
    setConfig((c) => ({ ...c, fieldsFromPosApi: entries }));
  }

  function handleInfoEndpointMappingChange(endpointId, text) {
    const lines = String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line);
    const mapping = {};
    lines.forEach((line) => {
      const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
      if (!match) return;
      const field = match[1].trim();
      const path = match[2].trim();
      if (!field || !path) return;
      mapping[field] = path;
    });
    setConfig((c) => {
      const next =
        c.infoEndpointMappings && typeof c.infoEndpointMappings === 'object'
          ? { ...c.infoEndpointMappings }
          : {};
      if (Object.keys(mapping).length > 0) next[endpointId] = mapping;
      else delete next[endpointId];
      return { ...c, infoEndpointMappings: next };
    });
  }

  async function handleSave() {
    if (!name) {
      alert('Please enter transaction name');
      return;
    }
    const normalizeMixedAccessList = (list = []) =>
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
    const normalizeProcedures = (list = []) =>
      Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((proc) => (typeof proc === 'string' ? proc.trim() : ''))
                .filter((proc) => proc),
            ),
          )
        : [];
    const normalizeInfoMappings = (map = {}) => {
      if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
      const normalized = {};
      Object.entries(map).forEach(([endpointId, mapping]) => {
        if (typeof endpointId !== 'string') return;
        const trimmedId = endpointId.trim();
        if (!trimmedId) return;
        if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return;
        const normalizedMapping = {};
        Object.entries(mapping).forEach(([field, path]) => {
          if (typeof field !== 'string' || typeof path !== 'string') return;
          const trimmedField = field.trim();
          const trimmedPath = path.trim();
          if (!trimmedField || !trimmedPath) return;
          normalizedMapping[trimmedField] = trimmedPath;
        });
        if (Object.keys(normalizedMapping).length > 0) {
          normalized[trimmedId] = normalizedMapping;
        }
      });
      return normalized;
    };
    const cfg = {
      ...config,
      moduleKey,
      allowedBranches: normalizeMixedAccessList(config.allowedBranches),
      allowedDepartments: normalizeMixedAccessList(config.allowedDepartments),
      allowedUserRights: normalizeMixedAccessList(config.allowedUserRights),
      allowedWorkplaces: normalizeMixedAccessList(config.allowedWorkplaces),
      procedures: normalizeProcedures(config.procedures),
      temporaryAllowedBranches: normalizeMixedAccessList(config.temporaryAllowedBranches),
      temporaryAllowedDepartments: normalizeMixedAccessList(
        config.temporaryAllowedDepartments,
      ),
      temporaryAllowedUserRights: normalizeMixedAccessList(
        config.temporaryAllowedUserRights,
      ),
      temporaryAllowedWorkplaces: normalizeMixedAccessList(
        config.temporaryAllowedWorkplaces,
      ),
      temporaryProcedures: normalizeProcedures(config.temporaryProcedures),
      transactionTypeValue: config.transactionTypeValue
        ? String(config.transactionTypeValue)
        : '',
    };
    cfg.posApiEndpointId = cfg.posApiEndpointId
      ? String(cfg.posApiEndpointId).trim()
      : '';
    if (!cfg.posApiEndpointId) {
      const defaultEndpoint = transactionEndpointOptions.find((opt) => opt?.defaultForForm);
      if (defaultEndpoint) cfg.posApiEndpointId = defaultEndpoint.value;
    }
    cfg.posApiTypeField = cfg.posApiTypeField
      ? String(cfg.posApiTypeField).trim()
      : '';
    cfg.posApiInfoEndpointIds = Array.isArray(cfg.posApiInfoEndpointIds)
      ? Array.from(
          new Set(
            cfg.posApiInfoEndpointIds
              .map((id) => (typeof id === 'string' ? id.trim() : ''))
              .filter((id) => id),
          ),
        )
      : [];
    cfg.infoEndpoints = Array.isArray(cfg.infoEndpoints)
      ? Array.from(
          new Set(
            cfg.infoEndpoints
              .map((id) => (typeof id === 'string' ? id.trim() : ''))
              .filter((id) => id),
          ),
        )
      : [...cfg.posApiInfoEndpointIds];
    if (!cfg.infoEndpoints.length) {
      cfg.infoEndpoints = [...cfg.posApiInfoEndpointIds];
    }
    cfg.fieldsFromPosApi = Array.isArray(cfg.fieldsFromPosApi)
      ? Array.from(
          new Set(
            cfg.fieldsFromPosApi
              .map((field) => (typeof field === 'string' ? field.trim() : ''))
              .filter((field) => field),
          ),
        )
      : [];
    cfg.infoEndpointMappings = normalizeInfoMappings(cfg.infoEndpointMappings);
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
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  marginBottom: '0.5rem',
                }}
              >
                <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
                  <span style={{ fontWeight: 600 }}>Primary endpoint</span>
                  <select
                    value={config.posApiEndpointId}
                    disabled={!config.posApiEnabled}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, posApiEndpointId: e.target.value }))
                    }
                  >
                    <option value="">Use registry default</option>
                    {transactionEndpointOptions.map((endpoint) => (
                      <option key={endpoint.value} value={endpoint.value}>
                        {endpoint.label}
                        {endpoint.defaultForForm ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
                  <span style={{ fontWeight: 600 }}>Lookup endpoints</span>
                  <select
                    multiple
                    value={config.posApiInfoEndpointIds}
                    onChange={handleInfoEndpointChange}
                    disabled={!config.posApiEnabled}
                    size={Math.min(
                      6,
                      Math.max(3, infoEndpointOptions.length || 0),
                    )}
                  >
                    {infoEndpointOptions.map((endpoint) => (
                      <option key={`info-${endpoint.value}`} value={endpoint.value}>
                        {endpoint.label}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#666' }}>
                    Hold Ctrl (Cmd on macOS) to select multiple endpoints.
                  </small>
                </label>
                <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
                  <span style={{ fontWeight: 600 }}>Type field override</span>
                  <input
                    type="text"
                    placeholder="Column name"
                    value={config.posApiTypeField}
                    onChange={(e) =>
                      setConfig((c) => ({ ...c, posApiTypeField: e.target.value }))
                    }
                    disabled={!config.posApiEnabled}
                  />
                  <small style={{ color: '#666' }}>
                    Optional column containing the POSAPI type (e.g., B2C_RECEIPT).
                  </small>
              </label>
            </div>
            {config.infoEndpoints.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <strong>Lookup field mapping</strong>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                  Define how responses from POSAPI lookup endpoints populate form fields. Use one mapping per line in the format
                  <code>field = response.path</code>.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '0.75rem',
                    marginTop: '0.5rem',
                  }}
                >
                  {config.infoEndpoints.map((endpointId) => {
                    const definition = posApiEndpoints.find((ep) => ep?.id === endpointId) || {};
                    const label = definition.name ? `${endpointId} – ${definition.name}` : endpointId;
                    const value = Object.entries(infoEndpointMappings[endpointId] || {})
                      .map(([field, path]) => `${field} = ${path}`)
                      .join('\n');
                    return (
                      <div
                        key={`info-mapping-${endpointId}`}
                        style={{
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '0.75rem',
                          backgroundColor: '#f9fafb',
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{label}</div>
                        <textarea
                          value={value}
                          onChange={(e) => handleInfoEndpointMappingChange(endpointId, e.target.value)}
                          placeholder={'customer_name = companyName\ncustomer_address = address.line1'}
                          disabled={!config.posApiEnabled}
                          style={{
                            width: '100%',
                            minHeight: '90px',
                            fontFamily: 'monospace',
                            resize: 'vertical',
                          }}
                        />
                        <small style={{ color: '#666' }}>
                          Supports dot and bracket notation. Example: <code>details[0].vatType</code>
                        </small>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                  marginBottom: '0.75rem',
                }}
              >
                <span style={{ fontWeight: 600 }}>Capture response fields</span>
                <textarea
                  rows={3}
                  value={config.fieldsFromPosApi.join('\n')}
                  onChange={(e) => handleFieldsFromPosApiChange(e.target.value)}
                  placeholder={'id\nlottery\nqrData'}
                  disabled={!config.posApiEnabled}
                  style={{ fontFamily: 'monospace', resize: 'vertical' }}
                />
                <small style={{ color: '#666' }}>
                  One field path per line (e.g., receipts[0].billId) to persist on the
                  transaction record.
                </small>
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
                <div style={{ marginTop: '1rem' }}>
                  <strong>Item field mapping</strong>
                  <p style={{ fontSize: '0.85rem', color: '#555' }}>
                    Provide column paths for individual item properties. Paths can reference nested JSON fields
                    (e.g., <code>details[0].name</code>).
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '0.75rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    {POS_API_ITEM_FIELDS.map((field) => {
                      const listId = `posapi-item-${field.key}-columns`;
                      return (
                        <label key={`item-${field.key}`} style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{field.label}</span>
                          <input
                            type="text"
                            list={listId}
                            value={itemFieldMapping[field.key] || ''}
                            onChange={(e) =>
                              updatePosApiNestedMapping('itemFields', field.key, e.target.value)
                            }
                            placeholder="Column or path"
                            disabled={!config.posApiEnabled}
                          />
                          <datalist id={listId}>
                            {columns.map((col) => (
                              <option key={`item-${field.key}-${col}`} value={col} />
                            ))}
                          </datalist>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <strong>Payment field mapping</strong>
                  <p style={{ fontSize: '0.85rem', color: '#555' }}>
                    Map payment properties when transactions include multiple payment entries.
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '0.75rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    {POS_API_PAYMENT_FIELDS.map((field) => {
                      const listId = `posapi-payment-${field.key}-columns`;
                      return (
                        <label key={`payment-${field.key}`} style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{field.label}</span>
                          <input
                            type="text"
                            list={listId}
                            value={paymentFieldMapping[field.key] || ''}
                            onChange={(e) =>
                              updatePosApiNestedMapping('paymentFields', field.key, e.target.value)
                            }
                            placeholder="Column or path"
                            disabled={!config.posApiEnabled}
                          />
                          <datalist id={listId}>
                            {columns.map((col) => (
                              <option key={`payment-${field.key}-${col}`} value={col} />
                            ))}
                          </datalist>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <strong>Receipt field mapping</strong>
                  <p style={{ fontSize: '0.85rem', color: '#555' }}>
                    Override fields within nested receipt objects when forms produce multiple receipts.
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '0.75rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    {POS_API_RECEIPT_FIELDS.map((field) => {
                      const listId = `posapi-receipt-${field.key}-columns`;
                      return (
                        <label key={`receipt-${field.key}`} style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{field.label}</span>
                          <input
                            type="text"
                            list={listId}
                            value={receiptFieldMapping[field.key] || ''}
                            onChange={(e) =>
                              updatePosApiNestedMapping('receiptFields', field.key, e.target.value)
                            }
                            placeholder="Column or path"
                            disabled={!config.posApiEnabled}
                          />
                          <datalist id={listId}>
                            {columns.map((col) => (
                              <option key={`receipt-${field.key}-${col}`} value={col} />
                            ))}
                          </datalist>
                        </label>
                      );
                    })}
                  </div>
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
                  <h4 style={subsectionTitleStyle}>Regular Access</h4>
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
                    <h4 style={subsectionTitleStyle}>Temporary Access</h4>
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
                                temporaryAllowedDepartments: deptOptions.map(
                                  (d) => d.value,
                                ),
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
                                temporaryAllowedUserRights: userRightOptions.map(
                                  (r) => r.value,
                                ),
                              }))
                            }
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfig((c) => ({
                                ...c,
                                temporaryAllowedUserRights: [],
                              }))
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
                                temporaryAllowedWorkplaces: workplaceOptions.map(
                                  (w) => w.value,
                                ),
                              }))
                            }
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfig((c) => ({
                                ...c,
                                temporaryAllowedWorkplaces: [],
                              }))
                            }
                          >
                            None
                          </button>
                        </div>
                      </div>

                      {procedureOptions.length > 0 && (
                        <div style={fieldColumnStyle}>
                          <span style={{ fontWeight: 600 }}>Temporary allowed procedures</span>
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
