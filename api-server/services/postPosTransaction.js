import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/index.js';
import { getConfigPath } from '../utils/configPaths.js';

function getValue(row, field) {
  const val = row?.[field];
  return val !== undefined && val !== null ? val : undefined;
}

function setValue(target, field, value) {
  if (target && field && (target[field] === undefined || target[field] === null)) {
    target[field] = value;
  }
}

function propagateCalcFields(cfg, data) {
  if (!Array.isArray(cfg.calcFields)) return;
  for (const map of cfg.calcFields) {
    let value;
    for (const cell of map.cells || []) {
      const { table, field } = cell;
      if (!table || !field) continue;
      const tData = data[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          const v = getValue(row, field);
          if (v !== undefined) {
            value = v;
            break;
          }
        }
        if (value !== undefined) break;
      } else {
        const v = getValue(tData, field);
        if (v !== undefined) {
          value = v;
          break;
        }
      }
    }
    if (value === undefined) continue;
    for (const cell of map.cells || []) {
      const { table, field } = cell;
      if (!table || !field) continue;
      const tData = data[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          setValue(row, field, value);
        }
      } else {
        setValue(tData, field, value);
      }
    }
  }
}

function evalPosFormulas(cfg, data) {
  if (!Array.isArray(cfg.posFields)) return;
  for (const pf of cfg.posFields) {
    const parts = pf.parts || [];
    if (!parts.length) continue;
    const [target, ...calc] = parts;
    let val = 0;
    let init = false;
    for (const p of calc) {
      const tData = data[p.table] || {};
      const num = Number(tData[p.field] ?? 0);
      if (p.agg === '=' && !init) {
        val = num;
        init = true;
      } else if (p.agg === '+') {
        val += num;
      } else if (p.agg === '-') {
        val -= num;
      } else if (p.agg === '=') {
        val = num;
      }
    }
    const targetTable = data[target.table];
    if (!targetTable) continue;
    if (Array.isArray(targetTable)) {
      for (const row of targetTable) {
        row[target.field] = val;
      }
    } else {
      targetTable[target.field] = val;
    }
  }
}

async function upsertRow(conn, table, row) {
  const cols = Object.keys(row);
  if (!cols.length) return null;
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols.map((c) => `${c}=VALUES(${c})`).join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  const params = cols.map((c) => row[c]);
  const [res] = await conn.query(sql, params);
  return res.insertId && res.insertId !== 0 ? res.insertId : row.id;
}

export async function postPosTransaction(
  data,
  sessionInfo = {},
  companyId = 0,
) {
    const { path: cfgPath } = await getConfigPath(
      'posTransactionConfig.json',
      companyId,
    );
  const cfgRaw = await fs.readFile(cfgPath, 'utf8');
  const json = JSON.parse(cfgRaw);
  const cfg = json['POS_Modmarket'];
  if (!cfg) throw new Error('POS_Modmarket config not found');

  // Propagate mapped values
  propagateCalcFields(cfg, data);

  // Evaluate formulas
  evalPosFormulas(cfg, data);

  const masterTable = 'transactions_pos';
  const posData = data[masterTable] || {};
  Object.assign(posData, sessionInfo);

  const required = ['pos_date', 'total_amount', 'total_quantity', 'payment_type'];
  for (const f of required) {
    if (posData[f] === undefined || posData[f] === null) {
      throw new Error(`Missing field ${f}`);
    }
  }

  const statusCfg = cfg.statusField || {};
  if (statusCfg.field && statusCfg.created != null) {
    posData[statusCfg.field] = statusCfg.created;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const masterId = await upsertRow(conn, masterTable, posData);

    const tables = [
      'transactions_plan',
      'transactions_expense',
      'transactions_order',
      'transactions_inventory',
      'transactions_income',
    ];
    for (const table of tables) {
      const tData = data[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          await upsertRow(conn, table, row);
        }
      } else {
        await upsertRow(conn, table, tData);
      }
    }

    if (statusCfg.field && statusCfg.beforePost != null) {
      await conn.query(
        `UPDATE ${masterTable} SET ${statusCfg.field}=? WHERE id=?`,
        [statusCfg.beforePost, masterId],
      );
    }
    if (statusCfg.field && statusCfg.posted != null) {
      await conn.query(
        `UPDATE ${masterTable} SET ${statusCfg.field}=? WHERE id=?`,
        [statusCfg.posted, masterId],
      );
    }

    await conn.commit();
    return masterId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default postPosTransaction;
