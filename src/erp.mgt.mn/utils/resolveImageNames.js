import buildImageName from './buildImageName.js';

function unwrapValue(value) {
  if (value && typeof value === 'object') {
    if (value.value !== undefined && value.value !== null) return value.value;
    if (value.id !== undefined && value.id !== null) return value.id;
    if (value.Id !== undefined && value.Id !== null) return value.Id;
    if (value.label !== undefined && value.label !== null) return value.label;
  }
  return value;
}

function getCase(obj, field, columnCaseMap) {
  if (!obj) return undefined;
  if (obj[field] !== undefined) return unwrapValue(obj[field]);
  const lower = field.toLowerCase();
  if (obj[columnCaseMap?.[lower]] !== undefined) {
    return unwrapValue(obj[columnCaseMap[lower]]);
  }
  const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
  return key ? unwrapValue(obj[key]) : undefined;
}

function pickConfigEntry(cfgs = {}, row = {}, columnCaseMap = {}) {
  const tVal =
    getCase(row, 'transtype', columnCaseMap) ||
    getCase(row, 'Transtype', columnCaseMap) ||
    getCase(row, 'UITransType', columnCaseMap) ||
    getCase(row, 'UITransTypeName', columnCaseMap);
  for (const [configName, cfg] of Object.entries(cfgs)) {
    if (!cfg.transactionTypeValue) continue;
    if (tVal !== undefined && String(tVal) === String(cfg.transactionTypeValue)) {
      return { config: cfg, configName };
    }
    if (cfg.transactionTypeField) {
      const val = getCase(row, cfg.transactionTypeField, columnCaseMap);
      if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
        return { config: cfg, configName };
      }
    } else {
      const matchField = Object.keys(row || {}).find(
        (k) =>
          String(getCase(row, k, columnCaseMap)) ===
          String(cfg.transactionTypeValue),
      );
      if (matchField) {
        return {
          config: { ...cfg, transactionTypeField: matchField },
          configName,
        };
      }
    }
  }
  return { config: {}, configName: '' };
}

function pickMatchingConfigs(cfgs = {}, row = {}, columnCaseMap = {}) {
  const matches = [];
  const tVal =
    getCase(row, 'transtype', columnCaseMap) ||
    getCase(row, 'Transtype', columnCaseMap) ||
    getCase(row, 'UITransType', columnCaseMap) ||
    getCase(row, 'UITransTypeName', columnCaseMap);
  for (const [configName, cfg] of Object.entries(cfgs)) {
    if (!cfg?.transactionTypeValue) continue;
    if (tVal !== undefined && String(tVal) === String(cfg.transactionTypeValue)) {
      matches.push({ config: cfg, configName });
      continue;
    }
    if (cfg.transactionTypeField) {
      const val = getCase(row, cfg.transactionTypeField, columnCaseMap);
      if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
        matches.push({ config: cfg, configName });
      }
    } else {
      const matchField = Object.keys(row || {}).find(
        (k) =>
          String(getCase(row, k, columnCaseMap)) ===
          String(cfg.transactionTypeValue),
      );
      if (matchField) {
        matches.push({
          config: { ...cfg, transactionTypeField: matchField },
          configName,
        });
      }
    }
  }
  return matches;
}

function collectImageFields(entries = []) {
  const fieldSet = new Set();
  const imageIdFields = new Set();
  const configNames = [];
  entries.forEach(({ config, configName }) => {
    if (configName) configNames.push(configName);
    if (Array.isArray(config?.imagenameField)) {
      config.imagenameField.forEach((field) => {
        if (field) fieldSet.add(field);
      });
    }
    if (typeof config?.imageIdField === 'string' && config.imageIdField) {
      fieldSet.add(config.imageIdField);
      imageIdFields.add(config.imageIdField);
    }
  });
  return {
    fields: Array.from(fieldSet),
    configNames,
    imageIdFields: Array.from(imageIdFields),
  };
}

function hasImageFields(config = {}) {
  return (
    (Array.isArray(config?.imagenameField) && config.imagenameField.length > 0) ||
    Boolean(config?.imageIdField)
  );
}

function collectAllConfigImageFields(cfgs = {}) {
  const entries = Object.entries(cfgs || {}).map(([configName, config]) => ({
    configName,
    config,
  }));
  return collectImageFields(entries);
}

function buildFallbackName(row = {}, columnCaseMap = {}) {
  const sanitize = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, '_');
  const fields = [
    'z_mat_code',
    'or_bcode',
    'bmtr_pmid',
    'pmid',
    'sp_primary_code',
    'pid',
  ];
  const parts = [];
  const base = fields
    .map((f) => getCase(row, f, columnCaseMap))
    .filter(Boolean)
    .join('_');
  if (base) parts.push(base);
  const o1 = [getCase(row, 'bmtr_orderid', columnCaseMap), getCase(row, 'bmtr_orderdid', columnCaseMap)]
    .filter(Boolean)
    .join('~');
  const o2 = [getCase(row, 'ordrid', columnCaseMap), getCase(row, 'ordrdid', columnCaseMap)]
    .filter(Boolean)
    .join('~');
  const ord = o1 || o2;
  if (ord) parts.push(ord);
  const transTypeVal =
    getCase(row, 'TransType', columnCaseMap) ||
    getCase(row, 'UITransType', columnCaseMap) ||
    getCase(row, 'UITransTypeName', columnCaseMap) ||
    getCase(row, 'transtype', columnCaseMap);
  const tType =
    getCase(row, 'trtype', columnCaseMap) ||
    getCase(row, 'UITrtype', columnCaseMap) ||
    getCase(row, 'TRTYPENAME', columnCaseMap) ||
    getCase(row, 'trtypename', columnCaseMap) ||
    getCase(row, 'uitranstypename', columnCaseMap) ||
    getCase(row, 'trTypeName', columnCaseMap) ||
    getCase(row, 'transtype', columnCaseMap);
  if (transTypeVal) parts.push(transTypeVal);
  if (tType) parts.push(tType);
  const cleaned = parts.filter(Boolean).join('_');
  return sanitize(cleaned || '');
}

export default function resolveImageNames({
  row = {},
  columnCaseMap = {},
  company,
  imagenameFields = [],
  imageIdField = '',
  configs = {},
  currentConfig = {},
  currentConfigName = '',
} = {}) {
  let primary = '';
  let missing = [];
  const idFieldSet = new Set();
  const hasCurrentConfig = currentConfig && Object.keys(currentConfig).length > 0;
  const preferredFields = hasCurrentConfig
    ? Array.isArray(currentConfig?.imagenameField)
      ? currentConfig.imagenameField
      : []
    : Array.isArray(imagenameFields)
    ? imagenameFields
    : [];
  const preferredImageIdField = hasCurrentConfig
    ? typeof currentConfig?.imageIdField === 'string'
      ? currentConfig.imageIdField
      : ''
    : imageIdField || '';
  const preferredFieldSet = Array.from(
    new Set([...preferredFields, preferredImageIdField].filter(Boolean)),
  );
  if (preferredImageIdField) idFieldSet.add(preferredImageIdField);
  if (preferredFieldSet.length > 0) {
    const result = buildImageName(row, preferredFieldSet, columnCaseMap, company);
    primary = result.name;
    missing = result.missing;
  }
  let configName = currentConfigName || '';
  if (!configName && Object.keys(configs || {}).length > 0) {
    const matched = pickConfigEntry(configs, row, columnCaseMap);
    if (matched.configName) configName = matched.configName;
  }
  if (!primary && Object.keys(configs || {}).length > 0) {
    if (!hasImageFields(currentConfig)) {
      const { fields, configNames, imageIdFields } =
        collectAllConfigImageFields(configs);
      imageIdFields.forEach((field) => idFieldSet.add(field));
      if (!configName && configNames.length > 0) configName = configNames[0];
      if (fields.length > 0) {
        const result = buildImageName(row, fields, columnCaseMap, company);
        if (result.name) {
          primary = result.name;
        }
        if (!missing.length) missing = result.missing;
      }
    } else {
      const matchedConfigs = pickMatchingConfigs(configs, row, columnCaseMap);
      const { fields, configNames, imageIdFields } =
        collectImageFields(matchedConfigs);
      imageIdFields.forEach((field) => idFieldSet.add(field));
      if (!configName && configNames.length > 0) configName = configNames[0];
      if (fields.length > 0) {
        const result = buildImageName(row, fields, columnCaseMap, company);
        if (result.name) {
          primary = result.name;
        }
        if (!missing.length) missing = result.missing;
      }
    }
  }
  if (!primary) {
    primary = buildFallbackName(row, columnCaseMap);
  }
  if (!primary && row?._imageName) {
    primary = row._imageName;
  }
  const altNames = [];
  let idName = '';
  idFieldSet.forEach((field) => {
    const { name } = buildImageName(row, [field], columnCaseMap, company);
    if (name && !idName) idName = name;
    if (name && name !== primary && !altNames.includes(name)) {
      altNames.push(name);
    }
  });
  if (row?._imageName && ![primary, ...altNames].includes(row._imageName)) {
    altNames.push(row._imageName);
  }
  return {
    primary,
    altNames,
    idName,
    missing,
    configName,
    imageIdFields: Array.from(idFieldSet),
  };
}
