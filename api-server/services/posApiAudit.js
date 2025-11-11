import { pool } from '../../db/index.js';

function serialize(value) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch (err) {
    try {
      return JSON.stringify(String(value));
    } catch {
      return JSON.stringify(null);
    }
  }
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value);
  }
  return String(value ?? '').trim() || null;
}

export async function recordPosApiInfoCall({
  endpointId,
  companyId,
  userId,
  tableName,
  formName,
  recordId,
  params,
  response,
}) {
  if (!endpointId) return;
  const payload = [
    endpointId,
    Number.isFinite(Number(companyId)) ? Number(companyId) : null,
    Number.isFinite(Number(userId)) ? Number(userId) : null,
    normalizeString(tableName),
    normalizeString(formName),
    normalizeString(recordId),
    serialize(params),
    serialize(response),
  ];
  try {
    await pool.query(
      `INSERT INTO posapi_info_audit (
        endpoint_id,
        company_id,
        user_id,
        table_name,
        form_name,
        record_id,
        request_params,
        response_body
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      payload,
    );
  } catch (err) {
    console.error('Failed to record POSAPI info audit entry', {
      endpointId,
      error: err,
    });
  }
}
