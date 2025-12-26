import React, { useEffect, useState, useContext, useMemo, useRef } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { refreshModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { resolveFeatureToggle, withPosApiEndpointMetadata } from '../utils/posApiConfig.js';
import { parseFieldSource } from '../utils/posApiFieldSource.js';
import PosApiIntegrationSection from '../components/PosApiIntegrationSection.jsx';
 

function normaliseEndpointUsage(value) {
  return typeof value === 'string' && ['transaction', 'info', 'admin'].includes(value)
    ? value
    : 'transaction';
}

function normaliseEndpointList(list, fallback) {
  const source = Array.isArray(list) ? list : fallback;
  const cleaned = source
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
  const effective = cleaned.length > 0 ? cleaned : fallback;
  return Array.from(new Set(effective));
}



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
  allowedPositions: [],
  allowedUserRights: [],
  allowedWorkplaces: [],
  procedures: [],
  temporaryAllowedBranches: [],
  temporaryAllowedDepartments: [],
  temporaryAllowedPositions: [],
  temporaryAllowedUserRights: [],
  temporaryAllowedWorkplaces: [],
  temporaryProcedures: [],
  posApiEnabled: false,
  posApiEndpointId: '',
  posApiEndpointMeta: null,
  posApiType: '',
  posApiInfoEndpointIds: [],
  posApiInfoEndpointMeta: [],
  infoEndpoints: [],
  posApiTypeField: '',
  posApiReceiptTypes: [],
  posApiReceiptTaxTypes: [],
  posApiPaymentMethods: [],
  posApiRequestVariation: '',
  posApiEnableReceiptTypes: undefined,
  posApiEnableReceiptItems: undefined,
  posApiEnableReceiptTaxTypes: undefined,
  posApiEnablePaymentMethods: undefined,
  fieldsFromPosApi: [],
  posApiMapping: {},
  posApiResponseMapping: {},
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
  const [positions, setPositions] = useState([]);
  const [positionCfg, setPositionCfg] = useState({ idField: null, displayFields: [] });
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [userRights, setUserRights] = useState([]);
  const [userRightCfg, setUserRightCfg] = useState({ idField: null, displayFields: [] });
  const [workplaces, setWorkplaces] = useState([]);
  const [workplaceCfg, setWorkplaceCfg] = useState({ idField: null, displayFields: [] });
  const [posApiEndpoints, setPosApiEndpoints] = useState([]);
  const loadingTablesRef = useRef(new Set());

  const parseColumnNames = (cols) => {
    if (Array.isArray(cols)) return cols.map((c) => c?.name || c).filter(Boolean);
    if (cols && Array.isArray(cols.columns)) return cols.columns.map((c) => c?.name || c).filter(Boolean);
    return [];
  };

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
  const responseFieldMapping =
    config.posApiResponseMapping && typeof config.posApiResponseMapping === 'object' && !Array.isArray(config.posApiResponseMapping)
      ? config.posApiResponseMapping
      : {};

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

  const positionOptions = useMemo(() => {
    const idField = positionCfg?.idField || 'position_id';
    return positions.map((pos) => {
      const val =
        pos[idField] ?? pos.position_id ?? pos.id ?? pos.positionId ?? '';
      const label = positionCfg?.displayFields?.length
        ? positionCfg.displayFields
            .map((field) => pos[field])
            .filter((v) => v !== undefined && v !== null)
            .join(' - ')
        : Object.values(pos)
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

  const endpointCandidates = useMemo(() => {
    const list = [];
    const addEndpoint = (endpoint, usageFallback = 'other') => {
      if (!endpoint) return;
      const enriched = withPosApiEndpointMetadata(endpoint);
      const id = typeof enriched?.id === 'string' ? enriched.id.trim() : '';
      if (!id) return;
      if (list.some((entry) => entry?.id === id)) return;
      list.push({ ...enriched, usage: enriched?.usage || usageFallback });
    };

    if (Array.isArray(posApiEndpoints)) {
      posApiEndpoints.forEach((endpoint) => addEndpoint(endpoint, endpoint?.usage || 'other'));
    }

    addEndpoint(config.posApiEndpointMeta, 'transaction');
    if (config.posApiEndpointId) {
      addEndpoint({ id: config.posApiEndpointId, usage: 'transaction' }, 'transaction');
    }

    const infoEndpointMeta = Array.isArray(config.posApiInfoEndpointMeta)
      ? config.posApiInfoEndpointMeta
      : [];
    infoEndpointMeta.forEach((meta) => addEndpoint(meta, 'info'));

    const infoEndpointIds = Array.isArray(config.posApiInfoEndpointIds)
      ? config.posApiInfoEndpointIds
      : [];
    infoEndpointIds.forEach((id) => addEndpoint({ id, usage: 'info' }, 'info'));

    return list;
  }, [
    posApiEndpoints,
    config.posApiEndpointMeta,
    config.posApiEndpointId,
    config.posApiInfoEndpointMeta,
    config.posApiInfoEndpointIds,
  ]);

  const endpointOptionGroups = useMemo(() => {
    const base = { transaction: [], info: [], admin: [], other: [] };
    endpointCandidates.forEach((endpoint) => {
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
  }, [endpointCandidates]);

  const transactionEndpointOptions = endpointOptionGroups.transaction;
  const infoEndpointOptions = endpointOptionGroups.info;

  const selectedEndpoint = useMemo(() => {
    let endpoint = null;
    if (config.posApiEndpointId) {
      endpoint = endpointCandidates.find((ep) => ep?.id === config.posApiEndpointId) || null;
    }
    if (!endpoint && config.posApiEndpointMeta) {
      endpoint = withPosApiEndpointMetadata(config.posApiEndpointMeta);
    }
    if (!endpoint && config.posApiMapping && config.posApiMapping.itemFields) {
      endpoint = { supportsItems: true };
    }
    return endpoint;
  }, [
    endpointCandidates,
    config.posApiEndpointId,
    config.posApiEndpointMeta,
    config.posApiMapping,
  ]);

  const endpointSupportsItems = selectedEndpoint?.supportsItems !== false;

  const endpointReceiptItemsEnabled = selectedEndpoint
    ? selectedEndpoint.enableReceiptItems !== false
    : endpointSupportsItems;
  const endpointReceiptTypesEnabled = selectedEndpoint
    ? selectedEndpoint.enableReceiptTypes !== false
    : true;
  const endpointReceiptTaxTypesEnabled = selectedEndpoint
    ? selectedEndpoint.enableReceiptTaxTypes !== false
    : true;
  const endpointPaymentMethodsEnabled = selectedEndpoint
    ? selectedEndpoint.enablePaymentMethods !== false
    : true;

  const receiptItemsToggleValue = resolveFeatureToggle(
    config.posApiEnableReceiptItems,
    endpointSupportsItems && endpointReceiptItemsEnabled,
    endpointReceiptItemsEnabled,
  );
  const receiptTypesToggleValue = resolveFeatureToggle(
    config.posApiEnableReceiptTypes,
    endpointReceiptTypesEnabled,
    endpointReceiptTypesEnabled,
  );
  const receiptTaxTypesToggleValue = resolveFeatureToggle(
    config.posApiEnableReceiptTaxTypes,
    endpointReceiptTaxTypesEnabled,
    endpointReceiptTaxTypesEnabled,
  );
  const paymentMethodsToggleValue = resolveFeatureToggle(
    config.posApiEnablePaymentMethods,
    endpointPaymentMethodsEnabled,
    endpointPaymentMethodsEnabled,
  );

  const supportsItems = receiptItemsToggleValue;

  const receiptTypesFeatureEnabled = config.posApiEnabled && receiptTypesToggleValue;
  const receiptTaxTypesFeatureEnabled = config.posApiEnabled && receiptTaxTypesToggleValue;
  const paymentMethodsFeatureEnabled = config.posApiEnabled && paymentMethodsToggleValue;
  const receiptTypesAllowMultiple = receiptTypesFeatureEnabled
    ? selectedEndpoint?.allowMultipleReceiptTypes !== false
    : true;
  const paymentMethodsAllowMultiple = paymentMethodsFeatureEnabled
    ? selectedEndpoint?.allowMultiplePaymentMethods !== false
    : true;

  const endpointReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.receiptTypes) &&
      selectedEndpoint.receiptTypes.length
    ) {
      return selectedEndpoint.receiptTypes.map((value) => String(value));
    }
    return [];
  }, [selectedEndpoint, receiptTypesFeatureEnabled]);

  const configuredReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    const values = Array.isArray(config.posApiReceiptTypes)
      ? config.posApiReceiptTypes
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value)
      : [];
    if (receiptTypesAllowMultiple) {
      return values;
    }
    return values.slice(0, 1);
  }, [config.posApiReceiptTypes, receiptTypesFeatureEnabled, receiptTypesAllowMultiple]);

  const effectiveReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    return configuredReceiptTypes.length ? configuredReceiptTypes : endpointReceiptTypes;
  }, [configuredReceiptTypes, endpointReceiptTypes, receiptTypesFeatureEnabled]);

  const receiptTypeUniverse = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    const allowed = new Set((endpointReceiptTypes || []).filter(Boolean));
    const combined = Array.from(
      new Set([...endpointReceiptTypes, ...configuredReceiptTypes].filter((value) => value)),
    );
    const filtered = combined.filter(
      (value) => allowed.has(value) || configuredReceiptTypes.includes(value),
    );
    if (filtered.length) return filtered;
    return endpointReceiptTypes;
  }, [endpointReceiptTypes, configuredReceiptTypes, receiptTypesFeatureEnabled]);

  const endpointPaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.paymentMethods) &&
      selectedEndpoint.paymentMethods.length
    ) {
      return selectedEndpoint.paymentMethods.map((value) => String(value));
    }
    return [];
  }, [selectedEndpoint, paymentMethodsFeatureEnabled]);

  const configuredPaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    const values = Array.isArray(config.posApiPaymentMethods)
      ? config.posApiPaymentMethods
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value)
      : [];
    if (paymentMethodsAllowMultiple) {
      return values;
    }
    return values.slice(0, 1);
  }, [config.posApiPaymentMethods, paymentMethodsFeatureEnabled, paymentMethodsAllowMultiple]);

  const effectivePaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    return configuredPaymentMethods.length
      ? configuredPaymentMethods
      : endpointPaymentMethods;
  }, [configuredPaymentMethods, endpointPaymentMethods, paymentMethodsFeatureEnabled]);

  const paymentMethodUniverse = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    const allowed = new Set((endpointPaymentMethods || []).filter(Boolean));
    const combined = Array.from(
      new Set([...endpointPaymentMethods, ...configuredPaymentMethods].filter((value) => value)),
    );
    const filtered = combined.filter(
      (value) => allowed.has(value) || configuredPaymentMethods.includes(value),
    );
    if (filtered.length) return filtered;
    return endpointPaymentMethods;
  }, [endpointPaymentMethods, configuredPaymentMethods, paymentMethodsFeatureEnabled]);

  const endpointReceiptTaxTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.receiptTaxTypes) &&
      selectedEndpoint.receiptTaxTypes.length
    ) {
      return selectedEndpoint.receiptTaxTypes.map((value) => String(value));
    }
    return [];
  }, [selectedEndpoint, receiptTaxTypesFeatureEnabled]);

  const topLevelFieldHints = useMemo(() => {
    const hints = selectedEndpoint?.mappingHints?.topLevelFields;
    if (!Array.isArray(hints)) return {};
    const map = {};
    hints.forEach((entry) => {
      if (!entry || typeof entry.field !== 'string') return;
      map[entry.field] = {
        required: Boolean(entry.required),
        description: typeof entry.description === 'string' ? entry.description : '',
      };
    });
    return map;
  }, [selectedEndpoint]);

  const itemFieldHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.itemFields;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((entry) => {
      if (!entry || typeof entry.field !== 'string') return;
      map[entry.field] = {
        required: Boolean(entry.required),
        description: typeof entry.description === 'string' ? entry.description : '',
      };
    });
    return map;
  }, [selectedEndpoint]);

  const receiptGroupHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.receiptGroups;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((group) => {
      const type = typeof group?.type === 'string' ? group.type : '';
      if (!type) return;
      const fieldMap = {};
      (group.fields || []).forEach((field) => {
        if (!field || typeof field.field !== 'string') return;
        fieldMap[field.field] = {
          required: Boolean(field.required),
          description: typeof field.description === 'string' ? field.description : '',
        };
      });
      map[type] = fieldMap;
    });
    return map;
  }, [selectedEndpoint]);

  const paymentMethodHints = useMemo(() => {
    const source = selectedEndpoint?.mappingHints?.paymentMethods;
    if (!Array.isArray(source)) return {};
    const map = {};
    source.forEach((method) => {
      const code = typeof method?.method === 'string' ? method.method : '';
      if (!code) return;
      const fieldMap = {};
      (method.fields || []).forEach((field) => {
        if (!field || typeof field.field !== 'string') return;
        fieldMap[field.field] = {
          required: Boolean(field.required),
          description: typeof field.description === 'string' ? field.description : '',
        };
      });
      map[code] = fieldMap;
    });
    return map;
  }, [selectedEndpoint]);

  const serviceReceiptGroupTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    const hintKeys = Object.keys(receiptGroupHints || {});
    const configuredKeys = Object.keys(receiptGroupMapping || {});
    const combined = Array.from(
      new Set([...endpointReceiptTaxTypes, ...hintKeys, ...configuredKeys]),
    ).filter(Boolean);
    if (combined.length) return combined;
    return ['VAT_ABLE'];
  }, [
    receiptGroupHints,
    receiptGroupMapping,
    endpointReceiptTaxTypes,
    receiptTaxTypesFeatureEnabled,
  ]);

  const servicePaymentMethodCodes = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    const selected = effectivePaymentMethods || [];
    const selectedSet = new Set(selected);
    const hintKeys = Object.keys(paymentMethodHints || {});
    const configuredKeys = Object.keys(paymentMethodMapping || {});
    const endpointKeys = endpointPaymentMethods || [];
    const base = selected.length > 0 ? selected : endpointKeys;
    const combined = new Set([
      ...base,
      ...configuredKeys,
      ...hintKeys.filter((code) => selectedSet.size === 0 || selectedSet.has(code)),
    ]);
    return Array.from(combined).filter((value) => {
      if (!value) return false;
      if (selectedSet.size === 0) return true;
      return selectedSet.has(value) || configuredKeys.includes(value);
    });
  }, [
    effectivePaymentMethods,
    paymentMethodHints,
    paymentMethodMapping,
    endpointPaymentMethods,
    paymentMethodsFeatureEnabled,
  ]);

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
    add(config.masterTable);
    config.tables.forEach((entry) => add(entry.table));
    Object.values(itemFieldMapping || {}).forEach((value) => {
      const parsed = parseFieldSource(value, config.masterTable);
      if (parsed.table) add(parsed.table);
    });
    return list;
  }, [config.masterTable, config.tables, itemFieldMapping]);

  const masterColumnOptions = useMemo(() => {
    const primary = config.masterTable;
    if (!primary) return masterCols;
    return tableColumns[primary] || masterCols;
  }, [config.masterTable, tableColumns, masterCols]);

  const allColumnOptions = useMemo(() => {
    const options = new Set();
    (tableColumns[config.masterTable] || masterCols || []).forEach((col) => {
      if (col) options.add(col);
    });
    config.tables.forEach((entry) => {
      const tbl = typeof entry?.table === 'string' ? entry.table.trim() : '';
      if (!tbl) return;
      (tableColumns[tbl] || []).forEach((col) => {
        if (col) options.add(`${tbl}.${col}`);
      });
    });
    return Array.from(options);
  }, [config.masterTable, config.tables, tableColumns, masterCols]);

  const columns = allColumnOptions;

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

    fetch('/api/posapi/endpoints', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setPosApiEndpoints(data.map(withPosApiEndpointMetadata));
        } else {
          setPosApiEndpoints([]);
        }
      })
      .catch(() => setPosApiEndpoints([]));

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

    fetch('/api/tables/code_position?perPage=500', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => setPositions(data.rows || []))
      .catch(() => setPositions([]));

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

    fetch('/api/display_fields?table=code_position', { credentials: 'include' })
      .then((res) =>
        res.ok ? res.json() : { idField: null, displayFields: [] },
      )
      .then((cfg) => setPositionCfg(cfg || { idField: null, displayFields: [] }))
      .catch(() => setPositionCfg({ idField: null, displayFields: [] }));

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
          const names = parseColumnNames(cols);
          setTableColumns((m) => ({ ...m, [tbl]: names }));
          if (tbl === config.masterTable) setMasterCols(names);
        })
        .catch(() => {});
    });
  }, [config.masterTable, config.tables, tableColumns]);

  const ensureColumnsLoadedFor = (tableName) => {
    const trimmed = typeof tableName === 'string' ? tableName.trim() : '';
    if (!trimmed) return;
    if (tableColumns[trimmed]) return;
    if (loadingTablesRef.current.has(trimmed)) return;
    loadingTablesRef.current.add(trimmed);
    fetch(`/api/tables/${encodeURIComponent(trimmed)}/columns`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((cols) => {
        const names = parseColumnNames(cols);
        setTableColumns((prev) => ({ ...prev, [trimmed]: names }));
        if (trimmed === config.masterTable) setMasterCols(names);
        if (names.length && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: `Loaded ${names.length} column${names.length === 1 ? '' : 's'} for ${trimmed}.`,
                type: 'success',
              },
            }),
          );
        }
      })
      .catch(() => {
        setTableColumns((prev) => ({ ...prev, [trimmed]: [] }));
      })
      .finally(() => {
        loadingTablesRef.current.delete(trimmed);
      });
  };

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
      const normalizeAccessStrings = (values) =>
        Array.isArray(values)
          ? Array.from(
              new Set(
                values
                  .map((val) => (val === undefined || val === null ? '' : String(val)))
                  .filter((val) => val.trim() !== ''),
              ),
            )
          : [];
      const normalizeProcedures = (values) =>
        Array.isArray(values)
          ? Array.from(
              new Set(
                values
                  .map((val) => (typeof val === 'string' ? val.trim() : ''))
                  .filter((val) => val),
              ),
            )
          : [];
      loaded.allowedBranches = normalizeAccessStrings(loaded.allowedBranches);
      loaded.allowedDepartments = normalizeAccessStrings(loaded.allowedDepartments);
      loaded.allowedPositions = normalizeAccessStrings(loaded.allowedPositions);
      loaded.allowedUserRights = normalizeAccessStrings(loaded.allowedUserRights);
      loaded.allowedWorkplaces = normalizeAccessStrings(loaded.allowedWorkplaces);
      loaded.procedures = normalizeProcedures(loaded.procedures);
      loaded.temporaryAllowedBranches = normalizeAccessStrings(
        loaded.temporaryAllowedBranches,
      );
      loaded.temporaryAllowedDepartments = normalizeAccessStrings(
        loaded.temporaryAllowedDepartments,
      );
      loaded.temporaryAllowedPositions = normalizeAccessStrings(
        loaded.temporaryAllowedPositions,
      );
      loaded.temporaryAllowedUserRights = normalizeAccessStrings(
        loaded.temporaryAllowedUserRights,
      );
      loaded.temporaryAllowedWorkplaces = normalizeAccessStrings(
        loaded.temporaryAllowedWorkplaces,
      );
      loaded.temporaryProcedures = normalizeProcedures(loaded.temporaryProcedures);

      loaded.posApiEnabled = Boolean(loaded.posApiEnabled);
      loaded.posApiEndpointId =
        typeof loaded.posApiEndpointId === 'string' ? loaded.posApiEndpointId : '';
      loaded.posApiType = typeof loaded.posApiType === 'string' ? loaded.posApiType : '';
      loaded.posApiTypeField =
        typeof loaded.posApiTypeField === 'string' ? loaded.posApiTypeField : '';
      loaded.posApiInfoEndpointIds = Array.isArray(loaded.posApiInfoEndpointIds)
        ? loaded.posApiInfoEndpointIds
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value)
        : [];
      loaded.infoEndpoints = Array.isArray(loaded.infoEndpoints)
        ? loaded.infoEndpoints
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value)
        : [...loaded.posApiInfoEndpointIds];
      if (!loaded.infoEndpoints.length) {
        loaded.infoEndpoints = [...loaded.posApiInfoEndpointIds];
      }
      loaded.posApiReceiptTypes = Array.isArray(loaded.posApiReceiptTypes)
        ? loaded.posApiReceiptTypes
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value)
        : [];
      loaded.posApiReceiptTaxTypes = Array.isArray(loaded.posApiReceiptTaxTypes)
        ? loaded.posApiReceiptTaxTypes
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value)
        : [];
      loaded.posApiPaymentMethods = Array.isArray(loaded.posApiPaymentMethods)
        ? loaded.posApiPaymentMethods
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value)
        : [];
      loaded.fieldsFromPosApi = Array.isArray(loaded.fieldsFromPosApi)
        ? loaded.fieldsFromPosApi
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value)
        : [];
      loaded.posApiResponseMapping =
        loaded.posApiResponseMapping &&
        typeof loaded.posApiResponseMapping === 'object' &&
        !Array.isArray(loaded.posApiResponseMapping)
          ? { ...loaded.posApiResponseMapping }
          : {};
      loaded.posApiMapping =
        loaded.posApiMapping &&
        typeof loaded.posApiMapping === 'object' &&
        !Array.isArray(loaded.posApiMapping)
          ? { ...loaded.posApiMapping }
          : {};
      if (loaded.posApiEndpointMeta && typeof loaded.posApiEndpointMeta === 'object') {
        loaded.posApiEndpointMeta = { ...loaded.posApiEndpointMeta };
      } else {
        delete loaded.posApiEndpointMeta;
      }
      loaded.posApiInfoEndpointMeta = Array.isArray(loaded.posApiInfoEndpointMeta)
        ? loaded.posApiInfoEndpointMeta.filter((entry) => entry && typeof entry === 'object')
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

  async function handleSave() {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      addToast('Please enter configuration name', 'error');
      return;
    }

    const normalizedMasterForm =
      typeof config.masterForm === 'string' ? config.masterForm.trim() : '';
    const normalizedMasterTable =
      (typeof config.masterTable === 'string' ? config.masterTable.trim() : '') ||
      formToTable[normalizedMasterForm] ||
      '';

    const normalizeTableEntry = (entry = {}) => {
      const form = typeof entry.form === 'string' ? entry.form.trim() : '';
      const explicitTable = typeof entry.table === 'string' ? entry.table.trim() : '';
      const resolvedTable = explicitTable || formToTable[form] || '';
      return {
        table: resolvedTable,
        form,
        type: entry.type === 'multi' ? 'multi' : 'single',
        position: entry.position || 'upper_left',
        view: entry.view || 'fitted',
      };
    };

    const normalizedTables = config.tables.map((entry) => normalizeTableEntry(entry));
    const tableOrder = [normalizedMasterTable, ...normalizedTables.map((t) => t.table)];

    const normalizedCalcFields = config.calcFields.map((row, rowIdx) => {
      const sourceCells = Array.isArray(row.cells) ? [...row.cells] : [];
      while (sourceCells.length < tableOrder.length) {
        sourceCells.push({ table: tableOrder[sourceCells.length], field: '', agg: '' });
      }
      const mappedCells = sourceCells.slice(0, tableOrder.length).map((cell, cellIdx) => ({
        table: tableOrder[cellIdx] || '',
        field: typeof cell?.field === 'string' ? cell.field : '',
        agg: typeof cell?.agg === 'string' ? cell.agg : '',
      }));
      return {
        name: row?.name || `Map${rowIdx + 1}`,
        cells: mappedCells,
      };
    });

    const normalizedPosFields = config.posFields.map((field, idx) => {
      const parts = Array.isArray(field?.parts) && field.parts.length
        ? field.parts
        : [{ agg: '=', field: '', table: normalizedMasterTable }];
      return {
        name: field?.name || `PF${idx + 1}`,
        parts: parts.map((part, partIdx) => ({
          agg: typeof part?.agg === 'string' ? part.agg : partIdx === 0 ? '=' : '+',
          field: typeof part?.field === 'string' ? part.field : '',
          table:
            (typeof part?.table === 'string' ? part.table : '') ||
            normalizedMasterTable,
        })),
      };
    });

    const normalizeProcedureList = (list = []) =>
      Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
                .filter((entry) => entry),
            ),
          )
        : [];

    const normalizedStatusField = {
      table: typeof config.statusField?.table === 'string' ? config.statusField.table : '',
      field: typeof config.statusField?.field === 'string' ? config.statusField.field : '',
      created:
        typeof config.statusField?.created === 'string'
          ? config.statusField.created
          : '',
      beforePost:
        typeof config.statusField?.beforePost === 'string'
          ? config.statusField.beforePost
          : '',
      posted:
        typeof config.statusField?.posted === 'string' ? config.statusField.posted : '',
    };

    const cleanedConfig = {
      ...config,
      masterForm: normalizedMasterForm,
      masterTable: normalizedMasterTable,
      masterType: config.masterType === 'multi' ? 'multi' : 'single',
      masterPosition: config.masterPosition || 'upper_left',
      masterView: config.masterView || 'fitted',
      tables: normalizedTables,
      calcFields: normalizedCalcFields,
      posFields: normalizedPosFields,
      statusField: normalizedStatusField,
      procedures: normalizeProcedureList(config.procedures),
      temporaryProcedures: normalizeProcedureList(config.temporaryProcedures),
      posApiResponseMapping:
        config.posApiResponseMapping &&
        typeof config.posApiResponseMapping === 'object' &&
        !Array.isArray(config.posApiResponseMapping)
          ? { ...config.posApiResponseMapping }
          : {},
    };

    cleanedConfig.supportsTemporarySubmission = Boolean(
      config.supportsTemporarySubmission ??
        config.allowTemporarySubmission ??
        false,
    );
    cleanedConfig.allowTemporarySubmission = cleanedConfig.supportsTemporarySubmission;

    try {
      const res = await fetch('/api/pos_txn_config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmedName, config: cleanedConfig }),
      });
      if (!res.ok) throw new Error('Unable to save configuration');
      refreshTxnModules();
      refreshModules();
      addToast('Saved', 'success');
      setConfigs((prev) => ({ ...prev, [trimmedName]: cleanedConfig }));
      setName(trimmedName);
      setConfig(cleanedConfig);
      setIsDefault(false);
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    }
  }

  async function handleDelete() {
    const trimmedName = (name || '').trim();
    if (!trimmedName) return;
    if (!window.confirm('Delete POS configuration?')) return;
    try {
      const res = await fetch(`/api/pos_txn_config?name=${encodeURIComponent(trimmedName)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Unable to delete configuration');
      addToast('Deleted', 'success');
      setConfigs((prev) => {
        const copy = { ...prev };
        delete copy[trimmedName];
        return copy;
      });
      setName('');
      setConfig({ ...emptyConfig });
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
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
        cells: [...(row.cells || []), { table: '', field: '', agg: '' }],
      })),
    }));
  }

  function removeMaster() {
    setConfig((c) => ({
      ...c,
      masterTable: '',
      masterForm: '',
      masterType: 'single',
      masterPosition: 'upper_left',
      masterView: 'fitted',
      calcFields: c.calcFields.map((row) => ({
        ...row,
        cells: (row.cells || []).map((cell, idx) =>
          idx === 0 ? { ...cell, table: '', field: '', agg: '' } : cell,
        ),
      })),
      posFields: c.posFields.map((field) => ({
        ...field,
        parts: (field.parts || []).map((part, idx) =>
          idx === 0 ? { ...part, agg: '=', table: '', field: '' } : part,
        ),
      })),
      statusField: { ...c.statusField, table: '', field: '' },
    }));
  }

  function removeColumn(idx) {
    setConfig((c) => {
      const removed = c.tables[idx];
      const updatedTables = c.tables.filter((_, i) => i !== idx);
      const updatedCalcFields = c.calcFields.map((row) => ({
        ...row,
        cells: (row.cells || []).filter((_, cellIdx) => cellIdx !== idx + 1),
      }));
      const statusField =
        removed && removed.table && c.statusField?.table === removed.table
          ? { ...c.statusField, table: '', field: '' }
          : c.statusField;
      return { ...c, tables: updatedTables, calcFields: updatedCalcFields, statusField };
    });
  }

  function updateColumn(idx, key, value) {
    const resolvedValue = typeof value === 'string' ? value : '';
    const resolvedTableName =
      key === 'form'
        ? formToTable[resolvedValue.trim()] || ''
        : key === 'table'
          ? resolvedValue.trim()
          : null;

    setConfig((c) => {
      const nextTables = c.tables.map((entry, i) => {
        if (i !== idx) return entry;
        if (key === 'form') {
          return {
            ...entry,
            form: resolvedValue.trim(),
            table: resolvedTableName || '',
          };
        }
        if (key === 'type') {
          return { ...entry, type: value === 'multi' ? 'multi' : 'single' };
        }
        if (key === 'position') {
          return { ...entry, position: resolvedValue || 'upper_left' };
        }
        if (key === 'view') {
          return { ...entry, view: resolvedValue || 'fitted' };
        }
        if (key === 'table') {
          return { ...entry, table: resolvedTableName || '' };
        }
        return { ...entry, [key]: value };
      });

      const totalColumns = nextTables.length + 1;
      const calcFields = c.calcFields.map((row) => {
        const cells = Array.isArray(row.cells) ? [...row.cells] : [];
        while (cells.length < totalColumns) {
          cells.push({ table: '', field: '', agg: '' });
        }
        if (resolvedTableName !== null) {
          cells[idx + 1] = { ...cells[idx + 1], table: resolvedTableName || '' };
        }
        return { ...row, cells };
      });

      return { ...c, tables: nextTables, calcFields };
    });

    if (resolvedTableName) {
      ensureColumnsLoadedFor(resolvedTableName);
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

                  if (tbl) {
                    ensureColumnsLoadedFor(tbl);
                  }
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                Regular Access
              </h4>
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
                      onClick={() => setConfig((c) => ({ ...c, allowedPositions: [] }))}
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

            <div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                Temporary Access
              </h4>
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
                          temporaryAllowedPositions: positionOptions.map((p) => p.value),
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
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
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

        <PosApiIntegrationSection
          config={config}
          setConfig={setConfig}
          sectionStyle={sectionStyle}
          sectionTitleStyle={sectionTitleStyle}
          fieldColumnStyle={fieldColumnStyle}
          primaryTableName={config.masterTable}
          primaryTableColumns={masterColumnOptions}
          columnOptions={columns}
          tableColumns={tableColumns}
          itemTableOptions={itemTableOptions}
          posApiEndpoints={posApiEndpoints}
          itemFieldMapping={itemFieldMapping}
          paymentFieldMapping={paymentFieldMapping}
          receiptFieldMapping={receiptFieldMapping}
          receiptGroupMapping={receiptGroupMapping}
          paymentMethodMapping={paymentMethodMapping}
          responseFieldMapping={responseFieldMapping}
          onEnsureColumnsLoaded={ensureColumnsLoadedFor}
        />

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
