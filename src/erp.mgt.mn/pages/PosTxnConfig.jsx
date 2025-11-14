import React, { useEffect, useState, useContext, useMemo, useRef } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { refreshTxnModules } from '../hooks/useTxnModules.js';
import { refreshModules } from '../hooks/useModules.js';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { withPosApiEndpointMetadata } from '../utils/posApiConfig.js';
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
  allowedUserRights: [],
  allowedWorkplaces: [],
  procedures: [],
  temporaryAllowedBranches: [],
  temporaryAllowedDepartments: [],
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
  posApiPaymentMethods: [],
  posApiEnableReceiptTypes: undefined,
  posApiEnableReceiptItems: undefined,
  posApiEnableReceiptTaxTypes: undefined,
  posApiEnablePaymentMethods: undefined,
  fieldsFromPosApi: [],
  posApiMapping: {},
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
  const [posApiEndpoints, setPosApiEndpoints] = useState([]);
  const loadingTablesRef = useRef(new Set());

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
    return DEFAULT_ENDPOINT_RECEIPT_TYPES_BASE;
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
    return DEFAULT_ENDPOINT_PAYMENT_METHODS_BASE;
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
    return DEFAULT_ENDPOINT_TAX_TYPES_BASE;
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

  const primaryPosApiFields = useMemo(() => {
    if (supportsItems) return POS_API_FIELDS_BASE;
    return POS_API_FIELDS_BASE.filter(
      (field) => !['itemsField', 'paymentsField', 'receiptsField'].includes(field.key),
    );
  }, [supportsItems]);

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

  const fieldsFromPosApiText = useMemo(() => {
    return Array.isArray(config.fieldsFromPosApi)
      ? config.fieldsFromPosApi.join('\n')
      : '';
  }, [config.fieldsFromPosApi]);

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
        const names = Array.isArray(cols) ? cols.map((c) => c.name || c) : [];
        setTableColumns((prev) => ({ ...prev, [trimmed]: names }));
        if (trimmed === config.masterTable) setMasterCols(names);
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
      loaded.allowedUserRights = normalizeAccessStrings(loaded.allowedUserRights);
      loaded.allowedWorkplaces = normalizeAccessStrings(loaded.allowedWorkplaces);
      loaded.procedures = normalizeProcedures(loaded.procedures);
      loaded.temporaryAllowedBranches = normalizeAccessStrings(
        loaded.temporaryAllowedBranches,
      );
      loaded.temporaryAllowedDepartments = normalizeAccessStrings(
        loaded.temporaryAllowedDepartments,
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

  function handleFieldsFromPosApiChange(value) {
    const entries = value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item);
    setConfig((c) => ({ ...c, fieldsFromPosApi: entries }));
  }

  function handleInfoEndpointChange(event) {
    const selected = Array.from(event.target.selectedOptions || [])
      .map((opt) => opt.value)
      .filter((value) => value);
    setConfig((c) => ({
      ...c,
      posApiInfoEndpointIds: selected,
      infoEndpoints: selected,
    }));
  }

  function toggleReceiptTypeSelection(type) {
    if (!receiptTypesFeatureEnabled) return;
    const normalized = typeof type === 'string' ? type.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiReceiptTypes)
        ? c.posApiReceiptTypes.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      if (!receiptTypesAllowMultiple) {
        if (current.length === 1 && current[0] === normalized) {
          return c;
        }
        return { ...c, posApiReceiptTypes: [normalized] };
      }
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        selectedSet.add(normalized);
      }
      const ordered = endpointReceiptTypes.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointReceiptTypes.includes(entry),
      );
      return { ...c, posApiReceiptTypes: [...ordered, ...leftovers] };
    });
  }

  function togglePaymentMethodSelection(method) {
    if (!paymentMethodsFeatureEnabled) return;
    const normalized = typeof method === 'string' ? method.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiPaymentMethods)
        ? c.posApiPaymentMethods.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      if (!paymentMethodsAllowMultiple) {
        if (current.length === 1 && current[0] === normalized) {
          return c;
        }
        return { ...c, posApiPaymentMethods: [normalized] };
      }
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        selectedSet.add(normalized);
      }
      const ordered = endpointPaymentMethods.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointPaymentMethods.includes(entry),
      );
      return { ...c, posApiPaymentMethods: [...ordered, ...leftovers] };
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

  function updatePosApiNestedMapping(scope, key, value) {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const current = base[scope] && typeof base[scope] === 'object' && !Array.isArray(base[scope])
        ? { ...base[scope] }
        : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete current[key];
      } else {
        current[key] = trimmed;
      }
      if (Object.keys(current).length === 0) {
        delete base[scope];
      } else {
        base[scope] = current;
      }
      return { ...c, posApiMapping: base };
    });
  }

  function updateReceiptGroupMapping(type, key, value) {
    const scope = 'receiptGroups';
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const currentGroups =
        base[scope] && typeof base[scope] === 'object' && !Array.isArray(base[scope])
          ? { ...base[scope] }
          : {};
      const group =
        currentGroups[type] && typeof currentGroups[type] === 'object'
          ? { ...currentGroups[type] }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete group[key];
      } else {
        group[key] = trimmed;
      }
      if (Object.keys(group).length === 0) {
        delete currentGroups[type];
      } else {
        currentGroups[type] = group;
      }
      if (Object.keys(currentGroups).length === 0) {
        delete base[scope];
      } else {
        base[scope] = currentGroups;
      }
      return { ...c, posApiMapping: base };
    });
  }

  function updatePaymentMethodMapping(method, key, value) {
    const scope = 'paymentMethods';
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const current =
        base[scope] && typeof base[scope] === 'object' && !Array.isArray(base[scope])
          ? { ...base[scope] }
          : {};
      const methodMap =
        current[method] && typeof current[method] === 'object'
          ? { ...current[method] }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete methodMap[key];
      } else {
        methodMap[key] = trimmed;
      }
      if (Object.keys(methodMap).length === 0) {
        delete current[method];
      } else {
        current[method] = methodMap;
      }
      if (Object.keys(current).length === 0) {
        delete base[scope];
      } else {
        base[scope] = current;
      }
      return { ...c, posApiMapping: base };
    });
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
      if (newTbl) ensureColumnsLoadedFor(newTbl);
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
    const sanitizedReceiptTypes = sanitizeSelectionList(
      config.posApiReceiptTypes,
      endpointReceiptTypes,
      receiptTypesAllowMultiple,
    );
    const sanitizedPaymentMethods = sanitizeSelectionList(
      config.posApiPaymentMethods,
      endpointPaymentMethods,
      paymentMethodsAllowMultiple,
    );
    const sanitizeEndpointList = (list) =>
      Array.isArray(list)
        ? Array.from(
            new Set(
              list
                .map((id) => (typeof id === 'string' ? id.trim() : ''))
                .filter((id) => id),
            ),
          )
        : [];
    const sanitizedInfoEndpoints = sanitizeEndpointList(config.posApiInfoEndpointIds);
    const sanitizedLookupEndpoints = sanitizeEndpointList(config.infoEndpoints);
    if (!sanitizedLookupEndpoints.length) {
      sanitizedLookupEndpoints.push(...sanitizedInfoEndpoints);
    }
    const sanitizedFieldsFromPosApi = Array.isArray(config.fieldsFromPosApi)
      ? Array.from(
          new Set(
            config.fieldsFromPosApi
              .map((field) => (typeof field === 'string' ? field.trim() : ''))
              .filter((field) => field),
          ),
        )
      : [];
    const saveCfg = {
      ...config,
      allowedBranches: normalizeAccessForSave(config.allowedBranches),
      allowedDepartments: normalizeAccessForSave(config.allowedDepartments),
      allowedUserRights: normalizeAccessForSave(config.allowedUserRights),
      allowedWorkplaces: normalizeAccessForSave(config.allowedWorkplaces),
      procedures: normalizedProcedures,
      temporaryAllowedBranches: normalizeAccessForSave(config.temporaryAllowedBranches),
      temporaryAllowedDepartments: normalizeAccessForSave(
        config.temporaryAllowedDepartments,
      ),
      temporaryAllowedUserRights: normalizeAccessForSave(
        config.temporaryAllowedUserRights,
      ),
      temporaryAllowedWorkplaces: normalizeAccessForSave(
        config.temporaryAllowedWorkplaces,
      ),
      temporaryProcedures: normalizedTemporaryProcedures,
      posApiEnabled: Boolean(config.posApiEnabled),
      posApiEndpointId: config.posApiEndpointId
        ? String(config.posApiEndpointId).trim()
        : '',
      posApiType: config.posApiType ? String(config.posApiType).trim() : '',
      posApiInfoEndpointIds: sanitizedInfoEndpoints,
      infoEndpoints: sanitizedLookupEndpoints,
      posApiTypeField: config.posApiTypeField
        ? String(config.posApiTypeField).trim()
        : '',
      posApiReceiptTypes: sanitizedReceiptTypes,
      posApiPaymentMethods: sanitizedPaymentMethods,
      fieldsFromPosApi: sanitizedFieldsFromPosApi,
      posApiMapping:
        config.posApiMapping && typeof config.posApiMapping === 'object'
          ? config.posApiMapping
          : {},
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
    ['posApiEnableReceiptTypes', 'posApiEnableReceiptItems', 'posApiEnableReceiptTaxTypes', 'posApiEnablePaymentMethods'].forEach(
      (key) => {
        if (typeof saveCfg[key] === 'boolean') {
          saveCfg[key] = Boolean(saveCfg[key]);
        } else {
          delete saveCfg[key];
        }
      },
    );
    if (!saveCfg.posApiEndpointId) {
      const defaultEndpoint = transactionEndpointOptions.find((opt) => opt?.defaultForForm);
      if (defaultEndpoint) saveCfg.posApiEndpointId = defaultEndpoint.value;
    }
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

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>POS API Integration</h3>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={Boolean(config.posApiEnabled)}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  posApiEnabled: e.target.checked,
                }))
              }
            />
            <span>Enable POSAPI submission</span>
          </label>
          {config.posApiEnabled && (
            <>
              <label style={{ ...fieldColumnStyle }}>
                <span style={{ fontWeight: 600 }}>Default POSAPI type</span>
                <select
                  value={config.posApiType}
                  disabled={!config.posApiEnabled}
                  onChange={(e) => setConfig((c) => ({ ...c, posApiType: e.target.value }))}
                >
                  <option value="">Use default from environment</option>
                  {receiptTypeUniverse.map((type) => (
                    <option key={`fallback-type-${type}`} value={type}>
                      {formatPosApiTypeLabel(type)}
                    </option>
                  ))}
                </select>
                <small style={{ color: '#666' }}>
                  Automatically switches to B2B when a customer TIN is provided and to B2C when a
                  consumer number is present.
                </small>
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
                    size={Math.min(6, Math.max(3, infoEndpointOptions.length || 0))}
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
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={receiptTypesToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnableReceiptTypes: e.target.checked,
                      }))
                    }
                    disabled={!endpointReceiptTypesEnabled}
                  />
                  <span>Enable receipt types</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={receiptItemsToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnableReceiptItems: e.target.checked,
                      }))
                    }
                    disabled={!endpointSupportsItems || !endpointReceiptItemsEnabled}
                  />
                  <span>Enable receipt items</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={receiptTaxTypesToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnableReceiptTaxTypes: e.target.checked,
                      }))
                    }
                    disabled={!endpointReceiptTaxTypesEnabled}
                  />
                  <span>Enable receipt tax types</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={paymentMethodsToggleValue}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        posApiEnablePaymentMethods: e.target.checked,
                      }))
                    }
                    disabled={!endpointPaymentMethodsEnabled}
                  />
                  <span>Enable payment methods</span>
                </label>
              </div>
            </>
          )}
          {config.posApiEnabled && selectedEndpoint && (
            <div
              style={{
                border: '1px solid #cbd5f5',
                background: '#f8fafc',
                borderRadius: '8px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <strong>Endpoint capabilities</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span
                  style={{
                    ...BADGE_BASE_STYLE_BASE,
                    background: supportsItems ? '#dcfce7' : '#fee2e2',
                    color: supportsItems ? '#047857' : '#b91c1c',
                  }}
                >
                  {supportsItems ? 'Supports items' : 'Service only'}
                </span>
                {selectedEndpoint.supportsMultipleReceipts && (
                  <span
                    style={{
                      ...BADGE_BASE_STYLE_BASE,
                      background: '#ede9fe',
                      color: '#5b21b6',
                    }}
                  >
                    Multiple receipts
                  </span>
                )}
                {selectedEndpoint.supportsMultiplePayments && (
                  <span
                    style={{
                      ...BADGE_BASE_STYLE_BASE,
                      background: '#cffafe',
                      color: '#0e7490',
                    }}
                  >
                    Multiple payments
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#475569' }}>
                    Receipt types
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {(selectedEndpoint.receiptTypes || []).map((type) => (
                      <span key={`endpoint-receipt-${type}`}>
                        {formatPosApiTypeLabelText(type)}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#475569' }}>
                    Payment methods
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {(selectedEndpoint.paymentMethods || []).map((method) => (
                      <span key={`endpoint-payment-${method}`}>
                        {PAYMENT_METHOD_LABELS_BASE[method] || method.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {receiptTypesFeatureEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <strong>Receipt types</strong>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                  Enable the POSAPI receipt types available for this form. Leave all selected to
                  allow automatic detection.
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                  }}
                >
                  {receiptTypeUniverse.map((type) => {
                    const checked = effectiveReceiptTypes.includes(type);
                    const inputType = receiptTypesAllowMultiple ? 'checkbox' : 'radio';
                    return (
                      <label
                        key={`pos-receipt-type-${type}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <input
                          type={inputType}
                          name="posapi-receipt-type"
                          checked={checked}
                          onChange={() => toggleReceiptTypeSelection(type)}
                          disabled={!config.posApiEnabled}
                        />
                        <span>{formatPosApiTypeLabelText(type)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {paymentMethodsFeatureEnabled && (
                <div>
                  <strong>Payment methods</strong>
                  <p style={{ fontSize: '0.85rem', color: '#555' }}>
                    Select the payment methods that can be submitted through this transaction.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    {paymentMethodUniverse.map((method) => {
                      const label = PAYMENT_METHOD_LABELS_BASE[method] || method.replace(/_/g, ' ');
                      const checked = effectivePaymentMethods.includes(method);
                      const inputType = paymentMethodsAllowMultiple ? 'checkbox' : 'radio';
                      return (
                        <label
                          key={`pos-payment-method-${method}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <input
                            type={inputType}
                            name="posapi-payment-method"
                            checked={checked}
                            onChange={() => togglePaymentMethodSelection(method)}
                            disabled={!config.posApiEnabled}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              marginTop: '0.75rem',
            }}
          >
            <span style={{ fontWeight: 600 }}>Capture response fields</span>
            <textarea
              rows={3}
              value={fieldsFromPosApiText}
              onChange={(e) => handleFieldsFromPosApiChange(e.target.value)}
              placeholder={'id\nlottery\nqrData'}
              disabled={!config.posApiEnabled}
              style={{ fontFamily: 'monospace', resize: 'vertical' }}
            />
            <small style={{ color: '#666' }}>
              One field path per line (e.g., receipts[0].billId) to persist on the transaction
              record.
            </small>
          </label>
          <div>
            <strong>Field mapping</strong>
            <p style={{ fontSize: '0.85rem', color: '#555' }}>
              Map POSAPI fields to the configured tables. Required fields are highlighted based on
              endpoint metadata.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              {primaryPosApiFields.map((field) => {
                const listId = `posapi-${field.key}-columns`;
                const hint = topLevelFieldHints[field.key] || {};
                const isRequired = Boolean(hint.required);
                const description = hint.description;
                const value = config.posApiMapping?.[field.key] || '';
                return (
                  <label key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontWeight: 600,
                        color: '#0f172a',
                      }}
                    >
                      {field.label}
                      <span
                        style={{
                          ...BADGE_BASE_STYLE_BASE,
                          ...(isRequired
                            ? REQUIRED_BADGE_STYLE_BASE
                            : OPTIONAL_BADGE_STYLE_BASE),
                        }}
                      >
                        {isRequired ? 'Required' : 'Optional'}
                      </span>
                    </span>
                    <input
                      type="text"
                      list={listId}
                      value={value}
                      onChange={(e) => updatePosApiMapping(field.key, e.target.value)}
                      placeholder="Column or path"
                      disabled={!config.posApiEnabled}
                    />
                    <datalist id={listId}>
                      {columns.map((col) => (
                        <option key={`field-${field.key}-${col}`} value={col} />
                      ))}
                    </datalist>
                    {description && <small style={{ color: '#555' }}>{description}</small>}
                  </label>
                );
              })}
            </div>
            {supportsItems && (
              <div style={{ marginTop: '1rem' }}>
                <strong>Item field mapping</strong>
                <p style={{ fontSize: '0.85rem', color: '#555' }}>
                  Choose the source table and column for each item property. Leave the table blank
                  to read from the master record or provide a custom JSON path.
                </p>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '0.75rem',
                    marginTop: '0.5rem',
                  }}
                >
                  {POS_API_ITEM_FIELDS_BASE.map((field) => {
                    const rawValue = itemFieldMapping[field.key] || '';
                    const parsed = parseFieldSource(rawValue, config.masterTable);
                    const selectedTable = parsed.table;
                    const columnValue = parsed.column;
                    const listId = `posapi-item-${field.key}-columns-${selectedTable || 'master'}`;
                    const availableColumns = selectedTable
                      ? tableColumns[selectedTable] || []
                      : masterColumnOptions || [];
                    const tableChoices = itemTableOptions.filter(Boolean).slice();
                    if (selectedTable && !tableChoices.includes(selectedTable)) {
                      tableChoices.unshift(selectedTable);
                    }
                    const itemHint = itemFieldHints[field.key] || {};
                    const itemRequired = Boolean(itemHint.required);
                    const itemDescription = itemHint.description;
                    return (
                      <div
                        key={`item-${field.key}`}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontWeight: 600,
                            color: '#0f172a',
                          }}
                        >
                          {field.label}
                          <span
                            style={{
                              ...BADGE_BASE_STYLE_BASE,
                              ...(itemRequired
                                ? REQUIRED_BADGE_STYLE_BASE
                                : OPTIONAL_BADGE_STYLE_BASE),
                            }}
                          >
                            {itemRequired ? 'Required' : 'Optional'}
                          </span>
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                            alignItems: 'center',
                          }}
                        >
                          <select
                            value={selectedTable}
                            onChange={(e) => {
                              const nextTable = e.target.value;
                              if (nextTable) ensureColumnsLoadedFor(nextTable);
                              const nextValue = buildFieldSource(nextTable, parsed.column);
                              updatePosApiNestedMapping('itemFields', field.key, nextValue);
                            }}
                            disabled={!config.posApiEnabled}
                            style={{ minWidth: '160px' }}
                          >
                            <option value="">{config.masterTable || 'Master table'}</option>
                            {tableChoices.map((tbl) => (
                              <option key={`item-${field.key}-table-${tbl}`} value={tbl}>
                                {tbl}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            list={listId}
                            value={columnValue}
                            onChange={(e) =>
                              updatePosApiNestedMapping(
                                'itemFields',
                                field.key,
                                buildFieldSource(selectedTable, e.target.value),
                              )
                            }
                            placeholder="Column or path"
                            disabled={!config.posApiEnabled}
                            style={{ flex: '1 1 160px', minWidth: '160px' }}
                          />
                        </div>
                        <datalist id={listId}>
                          {(availableColumns || []).map((col) => (
                            <option
                              key={`item-${field.key}-${selectedTable || 'master'}-${col}`}
                              value={col}
                            />
                          ))}
                        </datalist>
                        {itemDescription && <small style={{ color: '#555' }}>{itemDescription}</small>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                {POS_API_PAYMENT_FIELDS_BASE.map((field) => {
                  const listId = `posapi-payment-${field.key}-columns`;
                  return (
                    <label
                      key={`payment-${field.key}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                    >
                      <span style={{ fontWeight: 600 }}>{field.label}</span>
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
                Override fields within nested receipt objects when transactions produce multiple
                receipts.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                {POS_API_RECEIPT_FIELDS_BASE.map((field) => {
                  const listId = `posapi-receipt-${field.key}-columns`;
                  return (
                    <label
                      key={`receipt-${field.key}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                    >
                      <span style={{ fontWeight: 600 }}>{field.label}</span>
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
          {receiptTaxTypesFeatureEnabled && (
            <div style={{ marginTop: '1rem' }}>
              <strong>{supportsItems ? 'Receipt group overrides' : 'Service receipt groups'}</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                {supportsItems
                  ? 'Override totals for POSAPI receipt groups when itemised data needs to be regrouped by tax type.'
                  : 'Map aggregated service totals for each tax group. Required fields are marked in red based on the POSAPI endpoint metadata.'}
              </p>
              <div className="space-y-4" style={{ marginTop: '0.5rem' }}>
                {serviceReceiptGroupTypes.map((type) => {
                  const hintMap = receiptGroupHints[type] || {};
                  const baseFields = SERVICE_RECEIPT_FIELDS_BASE.map((entry) => entry.key);
                  const combined = Array.from(new Set([...baseFields, ...Object.keys(hintMap)]));
                  const groupValues =
                    receiptGroupMapping[type] && typeof receiptGroupMapping[type] === 'object'
                      ? receiptGroupMapping[type]
                      : {};
                  return (
                    <div
                      key={`service-group-${type}`}
                      style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        padding: '0.75rem',
                      }}
                    >
                      <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                        Tax group: {type.replace(/_/g, ' ')}
                      </h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: '0.75rem',
                        }}
                      >
                        {combined.map((fieldKey) => {
                          const descriptor = SERVICE_RECEIPT_FIELDS_BASE.find(
                            (entry) => entry.key === fieldKey,
                          );
                          const label = descriptor
                            ? descriptor.label
                            : fieldKey.replace(/([A-Z])/g, ' $1');
                          const hint = hintMap[fieldKey] || {};
                          const isRequired = Boolean(hint.required);
                          const description = hint.description;
                          const listId = `service-receipt-${type}-${fieldKey}`;
                          return (
                            <label
                              key={`service-receipt-${type}-${fieldKey}`}
                              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                            >
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                }}
                              >
                                {label}
                                <span
                                  style={{
                                    ...BADGE_BASE_STYLE_BASE,
                                    ...(isRequired
                                      ? REQUIRED_BADGE_STYLE_BASE
                                      : OPTIONAL_BADGE_STYLE_BASE),
                                  }}
                                >
                                  {isRequired ? 'Required' : 'Optional'}
                                </span>
                              </span>
                              <input
                                type="text"
                                list={listId}
                                value={groupValues[fieldKey] || ''}
                                onChange={(e) => updateReceiptGroupMapping(type, fieldKey, e.target.value)}
                                placeholder="Column or path"
                                disabled={!config.posApiEnabled}
                              />
                              <datalist id={listId}>
                                {columns.map((col) => (
                                  <option key={`service-receipt-${fieldKey}-${col}`} value={col} />
                                ))}
                              </datalist>
                              {description && <small style={{ color: '#555' }}>{description}</small>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {paymentMethodsFeatureEnabled && (
            <div style={{ marginTop: '1rem' }}>
              <strong>{supportsItems ? 'Payment method overrides' : 'Service payment methods'}</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                {supportsItems
                  ? 'Map stored payment breakdowns to the POSAPI method codes returned by the endpoint.'
                  : 'Map payment information captured on the transaction record to each available POSAPI payment method.'}
              </p>
              <div className="space-y-4" style={{ marginTop: '0.5rem' }}>
                {servicePaymentMethodCodes.map((method) => {
                  const hintMap = paymentMethodHints[method] || {};
                  const baseFields = SERVICE_PAYMENT_FIELDS_BASE.map((entry) => entry.key);
                  const combined = Array.from(new Set([...baseFields, ...Object.keys(hintMap)]));
                  const methodValues =
                    paymentMethodMapping[method] && typeof paymentMethodMapping[method] === 'object'
                      ? paymentMethodMapping[method]
                      : {};
                  const label = PAYMENT_METHOD_LABELS_BASE[method] || method.replace(/_/g, ' ');
                  return (
                    <div
                      key={`service-payment-${method}`}
                      style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        padding: '0.75rem',
                      }}
                    >
                      <h4 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Method: {label}</h4>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: '0.75rem',
                        }}
                      >
                        {combined.map((fieldKey) => {
                          const descriptor = SERVICE_PAYMENT_FIELDS_BASE.find(
                            (entry) => entry.key === fieldKey,
                          );
                          const fieldLabel = descriptor
                            ? descriptor.label
                            : fieldKey.replace(/([A-Z])/g, ' $1');
                          const hint = hintMap[fieldKey] || {};
                          const isRequired = Boolean(hint.required);
                          const description = hint.description;
                          const listId = `service-payment-${method}-${fieldKey}`;
                          return (
                            <label
                              key={`service-payment-${method}-${fieldKey}`}
                              style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                            >
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                }}
                              >
                                {fieldLabel}
                                <span
                                  style={{
                                    ...BADGE_BASE_STYLE_BASE,
                                    ...(isRequired
                                      ? REQUIRED_BADGE_STYLE_BASE
                                      : OPTIONAL_BADGE_STYLE_BASE),
                                  }}
                                >
                                  {isRequired ? 'Required' : 'Optional'}
                                </span>
                              </span>
                              <input
                                type="text"
                                list={listId}
                                value={methodValues[fieldKey] || ''}
                                onChange={(e) => updatePaymentMethodMapping(method, fieldKey, e.target.value)}
                                placeholder="Column or path"
                                disabled={!config.posApiEnabled}
                              />
                              <datalist id={listId}>
                                {columns.map((col) => (
                                  <option key={`service-payment-${fieldKey}-${col}`} value={col} />
                                ))}
                              </datalist>
                              {description && <small style={{ color: '#555' }}>{description}</small>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
