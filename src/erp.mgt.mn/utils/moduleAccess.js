const TRUE_STRINGS = new Set([
  '1',
  'true',
  'yes',
  'y',
  'allow',
  'allowed',
  'granted',
  'enabled',
  'enable',
  'on',
]);

const FALSE_STRINGS = new Set([
  '0',
  'false',
  'no',
  'n',
  'deny',
  'denied',
  'forbid',
  'forbidden',
  'blocked',
  'restricted',
  'disabled',
  'disable',
  'off',
  'null',
  'undefined',
  'nil',
  'inactive',
  'notallowed',
  'not-allowed',
]);

export function normalizeFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return false;
    if (TRUE_STRINGS.has(normalized)) {
      return true;
    }
    if (FALSE_STRINGS.has(normalized)) {
      return false;
    }
    const num = Number(normalized);
    if (!Number.isNaN(num)) {
      return num !== 0;
    }
    return true;
  }
  return Boolean(value);
}

export function isModulePermissionGranted(perms, key) {
  if (!perms || !Object.prototype.hasOwnProperty.call(perms, key)) return true;
  return normalizeFlag(perms[key]);
}

export function isModuleLicensed(licensed, key) {
  if (!licensed || !Object.prototype.hasOwnProperty.call(licensed, key)) return true;
  return normalizeFlag(licensed[key]);
}
