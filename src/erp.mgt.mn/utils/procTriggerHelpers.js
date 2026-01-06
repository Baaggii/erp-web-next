export function normalizeTriggerColumn(name, columnCaseMap = {}) {
  if (!name && name !== 0) return null;
  const mapped = columnCaseMap[String(name).toLowerCase()] || name;
  return typeof mapped === 'string' ? mapped : null;
}

export function createProcTriggerHelpers(procTriggers = {}, columnCaseMap = {}) {
  const isAssignmentTrigger = (cfg) =>
    cfg && (cfg.kind === 'assignment' || cfg.name === '__assignment__');

  const normalizeColumn = (name) => normalizeTriggerColumn(name, columnCaseMap);

  const getDirectTriggers = (col) => {
    if (!col && col !== 0) return [];
    const val = procTriggers[String(col).toLowerCase()];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  };

  const getParamTriggers = (col) => {
    const res = [];
    const colLower = String(col || '').toLowerCase();
    Object.entries(procTriggers || {}).forEach(([tCol, cfgList]) => {
      const list = Array.isArray(cfgList) ? cfgList : [cfgList];
      list.forEach((cfg) => {
        if (!cfg || !Array.isArray(cfg.params)) return;
        const paramsLower = cfg.params.map((p) => String(p || '').toLowerCase());
        if (paramsLower.includes(colLower)) {
          res.push([tCol, cfg]);
        }
      });
    });
    return res;
  };

  const hasTrigger = (col) => {
    const lower = String(col || '').toLowerCase();
    return (
      getDirectTriggers(col).length > 0 ||
      getParamTriggers(col).length > 0 ||
      Object.prototype.hasOwnProperty.call(procTriggers || {}, lower)
    );
  };

  const collectAssignmentTargets = (cfg, fallbackTarget = null) => {
    const targets = new Set();
    if (!isAssignmentTrigger(cfg)) return targets;
    const baseTargets = Array.isArray(cfg?.targets) ? cfg.targets : [];
    const normalizedTargets =
      baseTargets.length > 0 ? baseTargets : fallbackTarget ? [fallbackTarget] : [];
    normalizedTargets.forEach((target) => {
      const normalized = normalizeColumn(target) || target;
      if (normalized) targets.add(normalized);
    });
    Object.values(cfg?.outMap || {}).forEach((target) => {
      const normalized = normalizeColumn(target) || target;
      if (normalized) targets.add(normalized);
    });
    return targets;
  };

  return {
    collectAssignmentTargets,
    getDirectTriggers,
    getParamTriggers,
    hasTrigger,
    isAssignmentTrigger,
    normalizeColumn,
  };
}

export function buildTriggerPreviewPayload(baseValues = {}, overrides = {}, columnCaseMap = {}) {
  const payload = {};
  const appendEntries = (entries) => {
    entries.forEach(([rawKey, rawValue]) => {
      if (!rawKey && rawKey !== 0) return;
      const key = normalizeTriggerColumn(rawKey, columnCaseMap) || rawKey;
      if (typeof key !== 'string') return;
      let val = rawValue;
      if (val && typeof val === 'object' && 'value' in val) {
        val = val.value;
      }
      payload[key] = val;
    });
  };
  appendEntries(Object.entries(baseValues || {}));
  if (overrides && typeof overrides === 'object') {
    appendEntries(Object.entries(overrides));
  }
  return payload;
}

export function extractTriggerPreviewRow(data) {
  if (!data || typeof data !== 'object') return null;
  const base = {};
  if (Array.isArray(data.rows) && data.rows.length > 0 && typeof data.rows[0] === 'object') {
    Object.assign(base, data.rows[0]);
  }
  if (data.row && typeof data.row === 'object' && !Array.isArray(data.row)) {
    Object.assign(base, data.row);
  }
  Object.entries(data || {}).forEach(([key, value]) => {
    if (key === 'rows' || key === 'row') return;
    base[key] = value;
  });
  return Object.keys(base).length > 0 ? base : null;
}
