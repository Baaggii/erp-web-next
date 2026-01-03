import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'admin';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'admin';
process.env.DB_USER = process.env.DB_USER || 'user';
process.env.DB_PASS = process.env.DB_PASS || 'pass';
process.env.DB_NAME = process.env.DB_NAME || 'testdb';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';

const servicesPromise = import('../../api-server/services/procTriggers.js');

async function withMockedPool(queryImpl, fn) {
  const db = await import('../../db/index.js');
  const originalQuery = db.pool.query;
  db.pool.query = queryImpl;
  try {
    return await fn();
  } finally {
    db.pool.query = originalQuery;
  }
}

test('getProcTriggers surfaces assignment dependencies for parameter columns', async () => {
  const triggerSql = `
    SET
      NEW.classification_code = (SELECT c.classification_code FROM code_incometype c WHERE c.income_type_id = NEW.or_type_id AND c.company_id = NEW.company_id),
      NEW.tax_reason_code = NEW.or_type_id;
  `;

  await withMockedPool(async (sql) => {
    if (/SHOW TRIGGERS/i.test(sql)) {
      return [[{ Statement: triggerSql }]];
    }
    return [[]];
  }, async () => {
    const { getProcTriggers } = await servicesPromise;
    const triggers = await getProcTriggers('receipts');
    assert.ok(triggers.or_type_id, 'expected assignments to be keyed by parameter');
    const assignment = (triggers.or_type_id || []).find(
      (cfg) => cfg && cfg.kind === 'assignment',
    );
    assert.ok(assignment, 'expected assignment metadata to be present');
    assert.ok(
      assignment.targets?.includes('classification_code'),
      'classification_code should be listed as an assignment target',
    );
    assert.ok(
      assignment.targets?.includes('tax_reason_code'),
      'tax_reason_code should be listed as an assignment target',
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(triggers, 'classification_code'),
      'target column should still be marked as having a trigger',
    );
  });
});

test('previewTriggerAssignments evaluates direct assignments with provided values', async () => {
  const triggerSql = 'SET NEW.hidden_total = NEW.qty * NEW.price;';
  const queries = [];
  await withMockedPool(async (sql, params = []) => {
    queries.push({ sql, params });
    if (/SHOW TRIGGERS/i.test(sql)) {
      return [[{ Statement: triggerSql }]];
    }
    if (/SELECT\s*\(/i.test(sql)) {
      const [qty, price] = params;
      return [[{ value: (qty || 0) * (price || 0) }]];
    }
    return [[]];
  }, async () => {
    const { previewTriggerAssignments } = await servicesPromise;
    const result = await previewTriggerAssignments('orders', {
      qty: 3,
      price: 5,
    });

    assert.equal(result.hidden_total, 15);
    assert.ok(queries.some((q) => /SHOW TRIGGERS/i.test(q.sql)));
    assert.ok(queries.some((q) => /SELECT\s*\(/i.test(q.sql)));
  });
});
