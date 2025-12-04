import { pool } from '../../db/index.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const merchantCache = new Map();

function normalizeId(value) {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export async function getMerchantById(rawId) {
  const id = normalizeId(rawId);
  if (!id) return null;
  const cached = merchantCache.get(id);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const [rows] = await pool.query('SELECT * FROM merchant WHERE id = ? LIMIT 1', [id]);
  const merchant = Array.isArray(rows) && rows[0] ? rows[0] : null;
  merchantCache.set(id, { value: merchant, expiresAt: now + CACHE_TTL_MS });
  return merchant;
}

export function clearMerchantCache(id) {
  if (id === undefined || id === null) {
    merchantCache.clear();
    return;
  }
  const normalized = normalizeId(id);
  if (normalized) {
    merchantCache.delete(normalized);
  }
}
