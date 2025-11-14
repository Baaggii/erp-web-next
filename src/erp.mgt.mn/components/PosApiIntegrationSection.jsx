import React, { useMemo } from 'react';
import {
  POS_API_FIELDS,
  POS_API_ITEM_FIELDS,
  POS_API_PAYMENT_FIELDS,
  POS_API_RECEIPT_FIELDS,
  SERVICE_RECEIPT_FIELDS,
  SERVICE_PAYMENT_FIELDS,
  PAYMENT_METHOD_LABELS,
  DEFAULT_ENDPOINT_RECEIPT_TYPES,
  DEFAULT_ENDPOINT_TAX_TYPES,
  DEFAULT_ENDPOINT_PAYMENT_METHODS,
  BADGE_BASE_STYLE,
  REQUIRED_BADGE_STYLE,
  OPTIONAL_BADGE_STYLE,
  resolveFeatureToggle,
  withPosApiEndpointMetadata,
  formatPosApiTypeLabel,
  formatPosApiTypeLabelText,
} from '../utils/posApiConfig.js';
import { parseFieldSource, buildFieldSource } from '../utils/posApiFieldSource.js';

function sanitizeSelectionList(list, allowMultiple) {
  const values = Array.isArray(list)
    ? list.map((value) => (typeof value === 'string' ? value.trim() : '')).filter(Boolean)
    : [];
  if (allowMultiple) return values;
  return values.slice(0, 1);
}

export default function PosApiIntegrationSection({
  config,
  setConfig,
  sectionStyle,
  sectionTitleStyle,
  fieldColumnStyle,
  primaryTableName,
  primaryTableColumns = [],
  columnOptions = [],
  tableColumns = {},
  itemTableOptions = [],
  posApiEndpoints = [],
  itemFieldMapping = {},
  paymentFieldMapping = {},
  receiptFieldMapping = {},
  receiptGroupMapping = {},
  paymentMethodMapping = {},
  onEnsureColumnsLoaded = () => {},
}) {
  const posApiEnabled = Boolean(config.posApiEnabled);

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
    const base = {
      transaction: [],
      info: [],
      admin: [],
      other: [],
    };
    endpointCandidates.forEach((endpoint) => {
      if (!endpoint) return;
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
      const match = endpointCandidates.find(
        (candidate) => candidate?.id === config.posApiEndpointId,
      );
      if (match) endpoint = match;
    }
    if (!endpoint && config.posApiEndpointMeta) {
      endpoint = withPosApiEndpointMetadata(config.posApiEndpointMeta);
    }
    if (!endpoint) return null;
    const next = { ...endpoint };
    const hasItemMapping =
      config.posApiMapping &&
      typeof config.posApiMapping === 'object' &&
      (config.posApiMapping.itemFields || config.posApiMapping.itemsField);
    if (hasItemMapping) {
      next.supportsItems = true;
    }
    return next;
  }, [endpointCandidates, config.posApiEndpointId, config.posApiEndpointMeta, config.posApiMapping]);

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

  const receiptTypesFeatureEnabled = posApiEnabled && receiptTypesToggleValue;
  const receiptTaxTypesFeatureEnabled = posApiEnabled && receiptTaxTypesToggleValue;
  const paymentMethodsFeatureEnabled = posApiEnabled && paymentMethodsToggleValue;
  const supportsItems = posApiEnabled && receiptItemsToggleValue;

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
    return DEFAULT_ENDPOINT_RECEIPT_TYPES;
  }, [selectedEndpoint, receiptTypesFeatureEnabled]);

  const configuredReceiptTypes = useMemo(() => {
    if (!receiptTypesFeatureEnabled) return [];
    return sanitizeSelectionList(config.posApiReceiptTypes, receiptTypesAllowMultiple);
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

  const endpointReceiptTaxTypes = useMemo(() => {
    if (!receiptTaxTypesFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.receiptTaxTypes) &&
      selectedEndpoint.receiptTaxTypes.length
    ) {
      return selectedEndpoint.receiptTaxTypes.map((value) => String(value));
    }
    return DEFAULT_ENDPOINT_TAX_TYPES;
  }, [selectedEndpoint, receiptTaxTypesFeatureEnabled]);

  const endpointPaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    if (
      selectedEndpoint &&
      Array.isArray(selectedEndpoint.paymentMethods) &&
      selectedEndpoint.paymentMethods.length
    ) {
      return selectedEndpoint.paymentMethods.map((value) => String(value));
    }
    return DEFAULT_ENDPOINT_PAYMENT_METHODS;
  }, [selectedEndpoint, paymentMethodsFeatureEnabled]);

  const configuredPaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    return sanitizeSelectionList(config.posApiPaymentMethods, paymentMethodsAllowMultiple);
  }, [config.posApiPaymentMethods, paymentMethodsFeatureEnabled, paymentMethodsAllowMultiple]);

  const effectivePaymentMethods = useMemo(() => {
    if (!paymentMethodsFeatureEnabled) return [];
    return configuredPaymentMethods.length ? configuredPaymentMethods : endpointPaymentMethods;
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
    if (supportsItems) return POS_API_FIELDS;
    return POS_API_FIELDS.filter((field) =>
      ['itemsField', 'paymentsField', 'receiptsField'].includes(field.key) ? false : true,
    );
  }, [supportsItems]);

  const fieldsFromPosApiText = useMemo(() => {
    return Array.isArray(config.fieldsFromPosApi) ? config.fieldsFromPosApi.join('\n') : '';
  }, [config.fieldsFromPosApi]);

  const handleInfoEndpointChange = (event) => {
    const selected = Array.from(event.target.selectedOptions || [])
      .map((opt) => opt.value)
      .filter((value) => value);
    setConfig((c) => ({
      ...c,
      posApiInfoEndpointIds: selected,
      infoEndpoints: selected,
    }));
  };

  const handleFieldsFromPosApiChange = (value) => {
    const entries = value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item);
    setConfig((c) => ({ ...c, fieldsFromPosApi: entries }));
  };

  const updatePosApiMapping = (field, value) => {
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
  };

  const updatePosApiNestedMapping = (section, field, value) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const current = base[section];
      const nested =
        current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
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
  };

  const updateReceiptGroupMapping = (type, field, value) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const allGroups =
        base.receiptGroups && typeof base.receiptGroups === 'object' && !Array.isArray(base.receiptGroups)
          ? { ...base.receiptGroups }
          : {};
      const group =
        allGroups[type] && typeof allGroups[type] === 'object' && !Array.isArray(allGroups[type])
          ? { ...allGroups[type] }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete group[field];
      } else {
        group[field] = trimmed;
      }
      if (Object.keys(group).length) {
        allGroups[type] = group;
      } else {
        delete allGroups[type];
      }
      if (Object.keys(allGroups).length) {
        base.receiptGroups = allGroups;
      } else {
        delete base.receiptGroups;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const updatePaymentMethodMapping = (method, field, value) => {
    setConfig((c) => {
      const base = { ...(c.posApiMapping || {}) };
      const allMethods =
        base.paymentMethods && typeof base.paymentMethods === 'object' && !Array.isArray(base.paymentMethods)
          ? { ...base.paymentMethods }
          : {};
      const methodConfig =
        allMethods[method] && typeof allMethods[method] === 'object' && !Array.isArray(allMethods[method])
          ? { ...allMethods[method] }
          : {};
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        delete methodConfig[field];
      } else {
        methodConfig[field] = trimmed;
      }
      if (Object.keys(methodConfig).length) {
        allMethods[method] = methodConfig;
      } else {
        delete allMethods[method];
      }
      if (Object.keys(allMethods).length) {
        base.paymentMethods = allMethods;
      } else {
        delete base.paymentMethods;
      }
      return { ...c, posApiMapping: base };
    });
  };

  const toggleReceiptTypeSelection = (value) => {
    if (!receiptTypesFeatureEnabled) return;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiReceiptTypes)
        ? c.posApiReceiptTypes.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        if (receiptTypesAllowMultiple) {
          selectedSet.add(normalized);
        } else {
          selectedSet.clear();
          selectedSet.add(normalized);
        }
      }
      const ordered = endpointReceiptTypes.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointReceiptTypes.includes(entry),
      );
      return { ...c, posApiReceiptTypes: [...ordered, ...leftovers] };
    });
  };

  const togglePaymentMethodSelection = (value) => {
    if (!paymentMethodsFeatureEnabled) return;
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return;
    setConfig((c) => {
      const current = Array.isArray(c.posApiPaymentMethods)
        ? c.posApiPaymentMethods.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
      const selectedSet = new Set(current);
      if (selectedSet.has(normalized)) {
        selectedSet.delete(normalized);
      } else {
        if (paymentMethodsAllowMultiple) {
          selectedSet.add(normalized);
        } else {
          selectedSet.clear();
          selectedSet.add(normalized);
        }
      }
      const ordered = endpointPaymentMethods.filter((entry) => selectedSet.has(entry));
      const leftovers = Array.from(selectedSet).filter(
        (entry) => !endpointPaymentMethods.includes(entry),
      );
      return { ...c, posApiPaymentMethods: [...ordered, ...leftovers] };
    });
  };

  const primaryTableLabel = primaryTableName ? `${primaryTableName} (master)` : 'Master table';

  return (
    <section style={sectionStyle}>
      <h3 style={sectionTitleStyle}>POS API Integration</h3>
      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={posApiEnabled}
          onChange={(e) => setConfig((c) => ({ ...c, posApiEnabled: e.target.checked }))}
        />
        <span>Enable POSAPI submission</span>
      </label>
      {posApiEnabled && (
        <>
          <label style={{ ...fieldColumnStyle }}>
            <span style={{ fontWeight: 600 }}>Default POSAPI type</span>
            <select
              value={config.posApiType}
              disabled={!posApiEnabled}
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
                disabled={!posApiEnabled}
                onChange={(e) => setConfig((c) => ({ ...c, posApiEndpointId: e.target.value }))}
              >
                <option value="">Use registry default</option>
                {transactionEndpointOptions.map((endpoint) => (
                  <option key={`endpoint-${endpoint.value}`} value={endpoint.value}>
                    {endpoint.label}
                    {endpoint.defaultForForm ? ' (form default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...fieldColumnStyle, flex: '1 1 240px' }}>
              <span style={{ fontWeight: 600 }}>Info endpoints</span>
              <select
                multiple
                value={config.posApiInfoEndpointIds || []}
                onChange={handleInfoEndpointChange}
                disabled={!posApiEnabled}
                style={{ minHeight: `${Math.max(3, infoEndpointOptions.length || 0)}rem` }}
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
                onChange={(e) => setConfig((c) => ({ ...c, posApiTypeField: e.target.value }))}
                disabled={!posApiEnabled}
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
                disabled={!posApiEnabled || !endpointReceiptTypesEnabled}
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
                disabled={!posApiEnabled || !endpointSupportsItems || !endpointReceiptItemsEnabled}
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
                disabled={!posApiEnabled || !endpointReceiptTaxTypesEnabled}
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
                disabled={!posApiEnabled || !endpointPaymentMethodsEnabled}
              />
              <span>Enable payment methods</span>
            </label>
          </div>
        </>
      )}
      {posApiEnabled && selectedEndpoint && (
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
                ...BADGE_BASE_STYLE,
                background: supportsItems ? '#dcfce7' : '#fee2e2',
                color: supportsItems ? '#047857' : '#b91c1c',
              }}
            >
              {supportsItems ? 'Supports items' : 'Service only'}
            </span>
            {selectedEndpoint.supportsMultipleReceipts && (
              <span
                style={{
                  ...BADGE_BASE_STYLE,
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
                  ...BADGE_BASE_STYLE,
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
                  <span key={`endpoint-receipt-${type}`}>{formatPosApiTypeLabelText(type)}</span>
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
                    {PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, ' ')}
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
              Enable the POSAPI receipt types available for this form. Leave all selected to allow
              automatic detection.
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
                      checked={checked}
                      onChange={() => toggleReceiptTypeSelection(type)}
                      disabled={!posApiEnabled}
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
                Enable the POSAPI payment methods allowed for this form. Leave all selected to allow
                automatic detection.
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
                  const checked = effectivePaymentMethods.includes(method);
                  const inputType = paymentMethodsAllowMultiple ? 'checkbox' : 'radio';
                  return (
                    <label
                      key={`pos-payment-method-${method}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      <input
                        type={inputType}
                        checked={checked}
                        onChange={() => togglePaymentMethodSelection(method)}
                        disabled={!posApiEnabled}
                      />
                      <span>{PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, ' ')}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {posApiEnabled && (
        <>
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
          value={fieldsFromPosApiText}
          onChange={(e) => handleFieldsFromPosApiChange(e.target.value)}
          placeholder={'id\nlottery\nqrData'}
          disabled={!posApiEnabled}
          style={{ fontFamily: 'monospace', resize: 'vertical' }}
        />
        <small style={{ color: '#666' }}>
          One field path per line (e.g., receipts[0].billId) to persist on the transaction record.
        </small>
      </label>
      <div>
        <strong>Field mapping</strong>
        <p style={{ fontSize: '0.85rem', color: '#555' }}>
          Map POSAPI fields to columns in the master transaction table. Leave blank to skip optional
          fields.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.5rem',
          }}
        >
          {primaryPosApiFields.map((field) => {
            const listId = `posapi-${field.key}-columns`;
            const hint = topLevelFieldHints[field.key] || {};
            const isRequired = Boolean(hint.required);
            const description = hint.description;
            return (
              <label key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
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
                      ...BADGE_BASE_STYLE,
                      ...(isRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
                    }}
                  >
                    {isRequired ? 'Required' : 'Optional'}
                  </span>
                </span>
                <input
                  type="text"
                  list={listId}
                  value={config.posApiMapping?.[field.key] || ''}
                  onChange={(e) => updatePosApiMapping(field.key, e.target.value)}
                  placeholder="Column name"
                  disabled={!posApiEnabled}
                />
                <datalist id={listId}>
                  {columnOptions.map((col) => (
                    <option key={`primary-${field.key}-${col}`} value={col} />
                  ))}
                </datalist>
                {description && <small style={{ color: '#555' }}>{description}</small>}
              </label>
            );
          })}
        </div>
        {supportsItems && (
          <>
            <div style={{ marginTop: '1rem' }}>
              <strong>Item field mapping</strong>
              <p style={{ fontSize: '0.85rem', color: '#555' }}>
                Choose the source table and column for each item property. Leave the table blank to
                read from the master record or enter a custom JSON path.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '0.75rem',
                  marginTop: '0.5rem',
                }}
              >
                {POS_API_ITEM_FIELDS.map((field) => {
                  const rawValue = itemFieldMapping[field.key] || '';
                  const parsed = parseFieldSource(rawValue, primaryTableName);
                  const selectedTable = parsed.table;
                  const columnValue = parsed.column;
                  const listId = `posapi-item-${field.key}-columns-${selectedTable || 'master'}`;
                  const availableColumns = selectedTable
                    ? tableColumns[selectedTable] || []
                    : primaryTableColumns;
                  const filteredChoices = (itemTableOptions || [])
                    .filter((tbl) => {
                      if (!tbl) return false;
                      if (!primaryTableName) return true;
                      return tbl !== primaryTableName;
                    })
                    .slice();
                  if (
                    selectedTable &&
                    selectedTable !== '' &&
                    (!primaryTableName || selectedTable !== primaryTableName) &&
                    !filteredChoices.includes(selectedTable)
                  ) {
                    filteredChoices.unshift(selectedTable);
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
                            ...BADGE_BASE_STYLE,
                            ...(itemRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
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
                            if (nextTable) onEnsureColumnsLoaded(nextTable);
                            const nextValue = buildFieldSource(nextTable, parsed.column);
                            updatePosApiNestedMapping('itemFields', field.key, nextValue);
                          }}
                          disabled={!posApiEnabled}
                          style={{ minWidth: '160px' }}
                        >
                          <option value="">{primaryTableLabel}</option>
                          {filteredChoices.map((tbl) => (
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
                          disabled={!posApiEnabled}
                          style={{ flex: '1 1 140px', minWidth: '140px' }}
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
                        disabled={!posApiEnabled}
                      />
                      <datalist id={listId}>
                        {columnOptions.map((col) => (
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
                        disabled={!posApiEnabled}
                      />
                      <datalist id={listId}>
                        {columnOptions.map((col) => (
                          <option key={`receipt-${field.key}-${col}`} value={col} />
                        ))}
                      </datalist>
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {receiptTaxTypesFeatureEnabled && serviceReceiptGroupTypes.length > 0 && (
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
                const baseFields = SERVICE_RECEIPT_FIELDS.map((entry) => entry.key);
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
                        const descriptor = SERVICE_RECEIPT_FIELDS.find(
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
                                  ...BADGE_BASE_STYLE,
                                  ...(isRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
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
                              disabled={!posApiEnabled}
                            />
                            <datalist id={listId}>
                              {columnOptions.map((col) => (
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
        {paymentMethodsFeatureEnabled && servicePaymentMethodCodes.length > 0 && (
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
                const baseFields = SERVICE_PAYMENT_FIELDS.map((entry) => entry.key);
                const combined = Array.from(new Set([...baseFields, ...Object.keys(hintMap)]));
                const methodValues =
                  paymentMethodMapping[method] && typeof paymentMethodMapping[method] === 'object'
                    ? paymentMethodMapping[method]
                    : {};
                const label = PAYMENT_METHOD_LABELS[method] || method.replace(/_/g, ' ');
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
                        const descriptor = SERVICE_PAYMENT_FIELDS.find(
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
                                  ...BADGE_BASE_STYLE,
                                  ...(isRequired ? REQUIRED_BADGE_STYLE : OPTIONAL_BADGE_STYLE),
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
                              disabled={!posApiEnabled}
                            />
                            <datalist id={listId}>
                              {columnOptions.map((col) => (
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
      </div>
        </>
      )}
    </section>
  );
}
