import React, { useEffect, useState, useMemo, useContext, useRef } from 'react';
import { useModules, refreshModules } from '../hooks/useModules.js';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { debugLog } from '../utils/debug.js';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import useHeaderMappings, {
  clearHeaderMappingsCache,
} from '../hooks/useHeaderMappings.js';
import I18nContext from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { Navigate } from 'react-router-dom';
import { withPosApiEndpointMetadata } from '../utils/posApiConfig.js';
import { parseFieldSource } from '../utils/posApiFieldSource.js';
import PosApiIntegrationSection from '../components/PosApiIntegrationSection.jsx';
import { isModulePermissionGranted } from '../utils/moduleAccess.js';


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
  const allowedPositions = toArray(info.allowedPositions).map((v) => String(v));
  const allowedUserRights = toArray(info.allowedUserRights).map((v) => String(v));
  const allowedWorkplaces = toArray(info.allowedWorkplaces).map((v) => String(v));
  const temporaryAllowedBranches = toArray(info.temporaryAllowedBranches).map((v) =>
    String(v),
  );
  const temporaryAllowedDepartments = toArray(info.temporaryAllowedDepartments).map((v) =>
    String(v),
  );
  const temporaryAllowedPositions = toArray(info.temporaryAllowedPositions).map((v) =>
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
    isAllowedField: toString(info.isAllowedField),
    transactionTypeField: toString(info.transactionTypeField),
    transactionTypeValue: toString(info.transactionTypeValue),
    detectFields: toArray(info.detectFields),
    allowedBranches,
    allowedDepartments,
    allowedPositions,
    allowedUserRights,
    allowedWorkplaces,
    procedures,
    temporaryAllowedBranches,
    temporaryAllowedDepartments,
    temporaryAllowedPositions,
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
    posApiReceiptTypes: toArray(info.posApiReceiptTypes).map((v) =>
      typeof v === 'string' ? v : String(v),
    ),
    posApiPaymentMethods: toArray(info.posApiPaymentMethods).map((v) =>
      typeof v === 'string' ? v : String(v),
    ),
    posApiEndpointMeta:
      info && typeof info.posApiEndpointMeta === 'object'
        ? { ...info.posApiEndpointMeta }
        : null,
    posApiInfoEndpointMeta: Array.isArray(info.posApiInfoEndpointMeta)
      ? info.posApiInfoEndpointMeta.filter((entry) => entry && typeof entry === 'object')
      : [],
    posApiEnableReceiptTypes:
      typeof info.posApiEnableReceiptTypes === 'boolean'
        ? info.posApiEnableReceiptTypes
        : undefined,
    posApiEnableReceiptItems:
      typeof info.posApiEnableReceiptItems === 'boolean'
        ? info.posApiEnableReceiptItems
        : undefined,
    posApiEnableReceiptTaxTypes:
      typeof info.posApiEnableReceiptTaxTypes === 'boolean'
        ? info.posApiEnableReceiptTaxTypes
        : undefined,
    posApiEnablePaymentMethods:
      typeof info.posApiEnablePaymentMethods === 'boolean'
        ? info.posApiEnablePaymentMethods
        : undefined,
    posApiAllowMultipleReceiptTypes:
      typeof info.posApiAllowMultipleReceiptTypes === 'boolean'
        ? info.posApiAllowMultipleReceiptTypes
        : undefined,
    posApiAllowMultipleReceiptItems:
      typeof info.posApiAllowMultipleReceiptItems === 'boolean'
        ? info.posApiAllowMultipleReceiptItems
        : undefined,
    posApiAllowMultipleReceiptTaxTypes:
      typeof info.posApiAllowMultipleReceiptTaxTypes === 'boolean'
        ? info.posApiAllowMultipleReceiptTaxTypes
        : undefined,
    posApiAllowMultiplePaymentMethods:
      typeof info.posApiAllowMultiplePaymentMethods === 'boolean'
        ? info.posApiAllowMultiplePaymentMethods
        : undefined,
    fieldsFromPosApi: toArray(info.fieldsFromPosApi).map((v) =>
      typeof v === 'string' ? v : String(v),
    ),
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
  const [positions, setPositions] = useState([]);
  const [userRights, setUserRights] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);
  const [txnTypes, setTxnTypes] = useState([]);
  const [columns, setColumns] = useState([]);
  const [tableColumns, setTableColumns] = useState({});
  const [views, setViews] = useState([]);
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [branchCfg, setBranchCfg] = useState({ idField: null, displayFields: [] });
  const [deptCfg, setDeptCfg] = useState({ idField: null, displayFields: [] });
  const [positionCfg, setPositionCfg] = useState({ idField: null, displayFields: [] });
  const [userRightCfg, setUserRightCfg] = useState({ idField: null, displayFields: [] });
  const [workplaceCfg, setWorkplaceCfg] = useState({ idField: null, displayFields: [] });
  const [posApiEndpoints, setPosApiEndpoints] = useState([]);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState('');
  const [editLabels, setEditLabels] = useState(false);
  const [labelEdits, setLabelEdits] = useState({});
  const loadingTablesRef = useRef(new Set());
  const generalConfig = useGeneralConfig();
  const modules = useModules();
  const procMap = useHeaderMappings(procedureOptions);
  const columnHeaderMap = useHeaderMappings(columns);
  const [isDefault, setIsDefault] = useState(false);
  const hasAdmin =
    permissions?.permissions?.system_settings ||
    session?.permissions?.system_settings;
  const modulePermitted = isModulePermissionGranted(permissions, 'forms_management');
  if (!permissions) {
    return <p>{t('loading', 'Ачааллаж байна...')}</p>;
  }
  if (!hasAdmin && !modulePermitted) {
    return <Navigate to="/" replace />;
  }

  const openLabelEditor = () => {
    const map = {};
    columns.forEach((c) => {
      map[c] = columnHeaderMap[c] || '';
    });
    setLabelEdits(map);
    setEditLabels(true);
  };

  const saveFieldLabels = async () => {
    try {
      const res = await fetch('/api/header_mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(labelEdits),
      });
      if (!res.ok) {
        throw new Error('Failed to save header mappings');
      }
      clearHeaderMappingsCache(columns);
      setEditLabels(false);
    } catch {
      setEditLabels(false);
    }
  };
  function getProcLabel(name) {
    return generalConfig.general?.procLabels?.[name] || procMap[name] || name;
  }
  useEffect(() => {
    debugLog('Component mounted: FormsManagement');
  }, []);

  const ensureColumnsLoaded = (tableName, { updatePrimary = false, force = false } = {}) => {
    const trimmed = typeof tableName === 'string' ? tableName.trim() : '';
    if (!trimmed) {
      if (updatePrimary) setColumns([]);
      return;
    }
    const existing = tableColumns[trimmed];
    if (!force && existing) {
      if (updatePrimary) setColumns(existing);
      return;
    }
    if (loadingTablesRef.current.has(trimmed)) {
      if (updatePrimary && existing) setColumns(existing);
      return;
    }
    loadingTablesRef.current.add(trimmed);
    fetch(`/api/tables/${encodeURIComponent(trimmed)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => {
        const names = Array.isArray(cols) ? cols.map((c) => c.name || c) : [];
        setTableColumns((prev) => ({ ...prev, [trimmed]: names }));
        if (updatePrimary) setColumns(names);
      })
      .catch(() => {
        setTableColumns((prev) => ({ ...prev, [trimmed]: [] }));
        if (updatePrimary) setColumns([]);
      })
      .finally(() => {
        loadingTablesRef.current.delete(trimmed);
      });
  };

  const [config, setConfig] = useState(() => normalizeFormConfig());
  const [posApiOptionSnapshot, setPosApiOptionSnapshot] = useState({
    transactionEndpointOptions: [],
    endpointReceiptTypes: [],
    endpointPaymentMethods: [],
    receiptTypesAllowMultiple: true,
    paymentMethodsAllowMultiple: true,
  });

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
  const receiptGroupMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.receiptGroups === 'object' &&
    !Array.isArray(config.posApiMapping.receiptGroups)
      ? config.posApiMapping.receiptGroups
      : {};
  const paymentMethodMapping =
    config.posApiMapping &&
    typeof config.posApiMapping.paymentMethods === 'object' &&
    !Array.isArray(config.posApiMapping.paymentMethods)
      ? config.posApiMapping.paymentMethods
      : {};

  useEffect(() => {
    const tablesToLoad = new Set();
    Object.values(itemFieldMapping || {}).forEach((value) => {
      const parsed = parseFieldSource(value, table);
      if (parsed.table) tablesToLoad.add(parsed.table);
    });
    if (config.posApiMapping) {
      const descriptor = config.posApiMapping.itemsField || config.posApiMapping.items;
      if (descriptor && typeof descriptor === 'object' && descriptor.path) {
        const parsed = parseFieldSource(descriptor.path, table);
        if (parsed.table) tablesToLoad.add(parsed.table);
      }
    }
    tablesToLoad.forEach((tbl) => ensureColumnsLoaded(tbl));
  }, [itemFieldMapping, config.posApiMapping, table]);

  const itemTableOptions = useMemo(() => {
    const seen = new Set();
    const list = [];
    const add = (value) => {
      if (!value) return;
      const str = typeof value === 'string' ? value.trim() : String(value || '').trim();
      if (!str || seen.has(str)) return;
      seen.add(str);
      list.push(str);
    };
    add(table);
    Object.keys(tableColumns || {}).forEach(add);
    (tables || []).forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        add(entry);
        return;
      }
      if (typeof entry === 'object') {
        add(entry.table || entry.name || '');
      }
    });
    return list;
  }, [table, tableColumns, tables]);

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
        let list = [];
        if (Array.isArray(data)) {
          list = data;
        } else if (data && Array.isArray(data.endpoints)) {
          list = data.endpoints;
        }
        setPosApiEndpoints(list.map(withPosApiEndpointMetadata));
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

  const positionOptions = useMemo(() => {
    const idField = positionCfg?.idField || 'position_id';
    return positions.map((p) => {
      const val =
        p[idField] ?? p.position_id ?? p.id ?? p.positionId ?? '';
      const label = positionCfg?.displayFields?.length
        ? positionCfg.displayFields
            .map((f) => p[f])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(p)
            .filter((v) => v !== undefined && v !== null)
            .join(' - ');
      return { value: String(val), label: label || String(val) };
    });
  }, [positions, positionCfg]);

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
    ensureColumnsLoaded(cfg.table, { updatePrimary: true, force: true });
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
                ? data.filter((v) =>
                    String(v)
                      .toLowerCase()
                      .includes(String(viewPrefix).toLowerCase()),
                  )
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

      fetch('/api/tables/code_position?perPage=500', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((data) => setPositions(data.rows || []))
        .catch(() => setPositions([]));

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

      fetch('/api/display_fields?table=code_position', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { idField: null, displayFields: [] }))
        .then(setPositionCfg)
        .catch(() => setPositionCfg({ idField: null, displayFields: [] }));

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
    if (!table) {
      setColumns([]);
      return;
    }
    ensureColumnsLoaded(table, { updatePrimary: true });
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

  async function handleSave() {
    const trimmedName = (name || '').trim();
    const normalizedTable = (table || '').trim();
    if (!trimmedName) {
      addToast('Please enter transaction name', 'error');
      return;
    }
    if (!normalizedTable) {
      addToast('Please select table', 'error');
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
    const {
      transactionEndpointOptions = [],
      endpointReceiptTypes = [],
      endpointPaymentMethods = [],
      receiptTypesAllowMultiple = true,
      paymentMethodsAllowMultiple = true,
    } = posApiOptionSnapshot || {};

    const allowMultipleReceiptTypes =
      typeof config.posApiAllowMultipleReceiptTypes === 'boolean'
        ? config.posApiAllowMultipleReceiptTypes
        : receiptTypesAllowMultiple;
    const allowMultipleReceiptTaxTypes =
      typeof config.posApiAllowMultipleReceiptTaxTypes === 'boolean'
        ? config.posApiAllowMultipleReceiptTaxTypes
        : true;
    const allowMultiplePaymentMethods =
      typeof config.posApiAllowMultiplePaymentMethods === 'boolean'
        ? config.posApiAllowMultiplePaymentMethods
        : paymentMethodsAllowMultiple;

    const cfg = {
      ...config,
      moduleKey,
      allowedBranches: normalizeMixedAccessList(config.allowedBranches),
      allowedDepartments: normalizeMixedAccessList(config.allowedDepartments),
      allowedPositions: normalizeMixedAccessList(config.allowedPositions),
      allowedUserRights: normalizeMixedAccessList(config.allowedUserRights),
      allowedWorkplaces: normalizeMixedAccessList(config.allowedWorkplaces),
      procedures: normalizeProcedures(config.procedures),
      temporaryAllowedBranches: normalizeMixedAccessList(config.temporaryAllowedBranches),
      temporaryAllowedDepartments: normalizeMixedAccessList(
        config.temporaryAllowedDepartments,
      ),
      temporaryAllowedPositions: normalizeMixedAccessList(
        config.temporaryAllowedPositions,
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
    [
      'posApiEnableReceiptTypes',
      'posApiEnableReceiptItems',
      'posApiEnableReceiptTaxTypes',
      'posApiEnablePaymentMethods',
      'posApiAllowMultipleReceiptTypes',
      'posApiAllowMultipleReceiptItems',
      'posApiAllowMultipleReceiptTaxTypes',
      'posApiAllowMultiplePaymentMethods',
    ].forEach((key) => {
      if (typeof cfg[key] === 'boolean') {
        cfg[key] = Boolean(cfg[key]);
      } else {
        delete cfg[key];
      }
    });
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
    const sanitizeSelectionList = (list = [], allowedList = [], allowMultiple = true) => {
      const allowedSet = new Set(
        (allowedList || []).map((value) => (typeof value === 'string' ? value : String(value))),
      );
      const sanitized = Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value) => value),
            ),
          )
        : [];
      if (allowedSet.size === 0) {
        return allowMultiple ? sanitized : sanitized.slice(0, 1);
      }
      const filtered = sanitized.filter((value) => allowedSet.has(value));
      if (filtered.length) {
        return allowMultiple ? filtered : filtered.slice(0, 1);
      }
      const fallback = Array.from(allowedSet);
      return allowMultiple ? fallback : fallback.slice(0, 1);
    };
    cfg.posApiReceiptTypes = sanitizeSelectionList(
      config.posApiReceiptTypes,
      endpointReceiptTypes,
      allowMultipleReceiptTypes,
    );
    cfg.posApiPaymentMethods = sanitizeSelectionList(
      config.posApiPaymentMethods,
      endpointPaymentMethods,
      allowMultiplePaymentMethods,
    );
    if (Array.isArray(cfg.posApiReceiptTaxTypes)) {
      const normalized = cfg.posApiReceiptTaxTypes
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      cfg.posApiReceiptTaxTypes = allowMultipleReceiptTaxTypes
        ? normalized
        : normalized.slice(0, 1);
    } else {
      delete cfg.posApiReceiptTaxTypes;
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
    try {
      const res = await fetch('/api/transaction_forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          table: normalizedTable,
          name: trimmedName,
          config: cfg,
        }),
      });
      if (!res.ok) {
        let message = 'Save failed';
        try {
          const data = await res.json();
          message = data?.message || data?.error || message;
        } catch {
          try {
            const text = await res.text();
            message = text || message;
          } catch {
            // ignore
          }
        }
        throw new Error(message);
      }
      refreshTxnModules();
      refreshModules();
      addToast('Saved', 'success');
      setName(trimmedName);
      if (!names.includes(trimmedName)) setNames((n) => [...n, trimmedName]);
      const key = `${normalizedTable}::${trimmedName}`;
      const info = {
        key,
        name: trimmedName,
        table: normalizedTable,
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
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
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
                {columns.length > 0 && (
                  <label style={fieldColumnStyle}>
                    <span style={{ fontWeight: 600 }}>Allowed marker field</span>
                    <select
                      value={config.isAllowedField}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, isAllowedField: e.target.value }))
                      }
                    >
                      <option value="">-- select field with is_allowed value --</option>
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

            <PosApiIntegrationSection
              config={config}
              setConfig={setConfig}
              sectionStyle={sectionStyle}
              sectionTitleStyle={sectionTitleStyle}
              fieldColumnStyle={fieldColumnStyle}
              primaryTableName={table}
              primaryTableColumns={columns}
              columnOptions={columns}
              tableColumns={tableColumns}
              itemTableOptions={itemTableOptions}
              posApiEndpoints={posApiEndpoints}
              itemFieldMapping={itemFieldMapping}
              paymentFieldMapping={paymentFieldMapping}
              receiptFieldMapping={receiptFieldMapping}
              receiptGroupMapping={receiptGroupMapping}
              paymentMethodMapping={paymentMethodMapping}
              onEnsureColumnsLoaded={ensureColumnsLoaded}
              onPosApiOptionsChange={setPosApiOptionSnapshot}
            />

            <section style={sectionStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                }}
              >
                <h3 style={sectionTitleStyle}>Field Configuration</h3>
                {generalConfig.general?.editLabelsEnabled && (
                  <button onClick={openLabelEditor}>Edit Field Labels</button>
                )}
              </div>
              <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead className="sticky-header">
              <tr>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Field</th>
                <th style={{ border: '1px solid #ccc', padding: '4px' }}>Label</th>
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
                  <td style={{ border: '1px solid #ccc', padding: '4px' }}>
                    {columnHeaderMap[col] || ''}
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
                      <span style={{ fontWeight: 600 }}>Allowed positions</span>
                      <select
                        multiple
                        size={8}
                        value={config.allowedPositions}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            allowedPositions: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {positionOptions.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              allowedPositions: positionOptions.map((p) => p.value),
                            }))
                          }
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, allowedPositions: [] }))
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
                      <span style={{ fontWeight: 600 }}>Temporary allowed positions</span>
                      <select
                        multiple
                        size={8}
                        value={config.temporaryAllowedPositions}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            temporaryAllowedPositions: Array.from(
                              e.target.selectedOptions,
                              (o) => o.value,
                            ),
                          }))
                        }
                      >
                        {positionOptions.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              temporaryAllowedPositions: positionOptions.map(
                                (p) => p.value,
                              ),
                            }))
                          }
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((c) => ({ ...c, temporaryAllowedPositions: [] }))
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
            {editLabels && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000,
                }}
              >
                <div
                  style={{
                    backgroundColor: '#fff',
                    padding: '1rem',
                    borderRadius: '4px',
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    minWidth: '320px',
                  }}
                >
                  <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Edit Field Labels</h3>
                  {columns.map((c) => (
                    <div key={c} style={{ marginBottom: '0.5rem' }}>
                      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ minWidth: '120px' }}>{c}</span>
                        <input
                          value={labelEdits[c] || ''}
                          onChange={(e) => setLabelEdits({ ...labelEdits, [c]: e.target.value })}
                          style={{ flex: 1 }}
                        />
                      </label>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
                    <button onClick={() => setEditLabels(false)} style={{ marginRight: '0.5rem' }}>
                      Cancel
                    </button>
                    <button onClick={saveFieldLabels}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
