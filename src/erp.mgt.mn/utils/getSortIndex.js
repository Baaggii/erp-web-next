const CANDIDATE_KEYS = [
  'dropdownIndex',
  'dropdown_index',
  'index',
  'idx',
  'orderIndex',
  'order_index',
  'sortIndex',
  'sort_index',
  'sortOrder',
  'sort_order',
  'sequence',
  'sequenceIndex',
  'sequence_index',
  'position',
  'priority',
  'displayIndex',
  'display_index',
  'listIndex',
  'list_index',
  'menuIndex',
  'menu_index',
  'uiTransType',
  'UITransType',
  'transType',
  'TransType',
  'tableIndex',
  'table_index',
  'filterIndex',
  'filter_index',
];

const FALLBACK_SUFFIXES = [
  'index',
  'order',
  'position',
  'priority',
  'sequence',
  'sort',
  'rank',
];

const NESTED_TARGET_KEYS = [
  null,
  'meta',
  'info',
  'config',
  'defaultValues',
  'data',
  'payload',
];

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'bigint') {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
  return null;
}

function getCandidateValue(target, key) {
  if (!target || typeof target !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    return target[key];
  }
  const lower = key.toLowerCase();
  for (const prop of Object.keys(target)) {
    if (prop === key) continue;
    if (prop.toLowerCase() === lower) {
      return target[prop];
    }
  }
  return null;
}

export function getSortIndex(source) {
  if (!source || typeof source !== 'object') return null;
  for (const nestedKey of NESTED_TARGET_KEYS) {
    const target = nestedKey ? source?.[nestedKey] : source;
    if (!target || typeof target !== 'object') continue;

    for (const key of CANDIDATE_KEYS) {
      const raw = getCandidateValue(target, key);
      const num = toFiniteNumber(raw);
      if (num !== null) return num;
    }

    for (const [key, value] of Object.entries(target)) {
      const lower = key.toLowerCase();
      if (
        FALLBACK_SUFFIXES.some(
          (suffix) => lower === suffix || lower.endsWith(suffix),
        )
      ) {
        const num = toFiniteNumber(value);
        if (num !== null) return num;
      }
    }
  }

  return null;
}

export function compareBySortIndex(a, b, { getSource, getLabel } = {}) {
  const sourceA = getSource ? getSource(a) : a;
  const sourceB = getSource ? getSource(b) : b;
  const idxA = getSortIndex(sourceA);
  const idxB = getSortIndex(sourceB);

  if (idxA !== null && idxB !== null && idxA !== idxB) {
    return idxA - idxB;
  }
  if (idxA !== null && idxB === null) return -1;
  if (idxB !== null && idxA === null) return 1;

  if (getLabel) {
    const labelA = getLabel(a);
    const labelB = getLabel(b);
    if (labelA != null && labelB != null) {
      return String(labelA).localeCompare(String(labelB), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    }
  }

  return 0;
}

export function sortByIndexThenLabel(list, options = {}) {
  if (!Array.isArray(list)) return [];
  const { getLabel, getSource } = options;
  return [...list].sort((a, b) => {
    const base = compareBySortIndex(a, b, { getSource, getLabel });
    if (base !== 0) return base;
    if (!getLabel) return 0;
    const labelA = getLabel(a);
    const labelB = getLabel(b);
    return String(labelA ?? '').localeCompare(String(labelB ?? ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function toFiniteSortIndex(value) {
  return toFiniteNumber(value);
}
