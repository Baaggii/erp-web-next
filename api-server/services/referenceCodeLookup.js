import { pool } from '../../db/index.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function normalizeCodeType(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeCodeValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    if (typeof value.code === 'string') {
      return value.code.trim();
    }
    if (typeof value.id === 'number' || typeof value.id === 'string') {
      return String(value.id).trim();
    }
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value || '').trim();
}

async function loadCodeMap(codeType) {
  const normalizedType = normalizeCodeType(codeType);
  if (!normalizedType) {
    return { byId: new Map(), byCode: new Map() };
  }
  const now = Date.now();
  const cached = cache.get(normalizedType);
  if (cached && cached.expiresAt > now) {
    return cached.map;
  }
  const [rows] = await pool.query(
    'SELECT id, code, name FROM ebarimt_reference_code WHERE code_type = ? AND is_active = 1',
    [normalizedType],
  );
  const byId = new Map();
  const byCode = new Map();
  rows.forEach((row) => {
    if (!row) return;
    const code = typeof row.code === 'string' ? row.code.trim() : '';
    const id = typeof row.id === 'number' ? row.id : Number(row.id);
    const entry = {
      id: Number.isFinite(id) ? id : null,
      code,
      name: row.name || null,
    };
    if (entry.id !== null) {
      byId.set(entry.id, entry);
    }
    if (code) {
      byCode.set(code.toUpperCase(), entry);
    }
  });
  const map = { byId, byCode };
  cache.set(normalizedType, { expiresAt: now + CACHE_TTL_MS, map });
  return map;
}

export async function resolveReferenceCodeValue(codeType, rawValue) {
  const normalizedValue = normalizeCodeValue(rawValue);
  if (!normalizedValue) return null;
  const map = await loadCodeMap(codeType);
  if (!map) return { id: null, code: normalizedValue, name: null };
  const numericId = Number(normalizedValue);
  if (!Number.isNaN(numericId) && map.byId.has(numericId)) {
    return map.byId.get(numericId);
  }
  const upperCode = normalizedValue.toUpperCase();
  if (map.byCode.has(upperCode)) {
    return map.byCode.get(upperCode);
  }
  return { id: null, code: normalizedValue, name: null };
}

export function clearReferenceCodeCache(codeType) {
  if (!codeType) {
    cache.clear();
    return;
  }
  cache.delete(normalizeCodeType(codeType));
}
