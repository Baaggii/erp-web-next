import test from 'node:test';
import assert from 'node:assert/strict';
import buildTenantNormalizedProcedure from '../../src/erp.mgt.mn/utils/buildTenantNormalizedProcedure.js';

const baseReport = {
  from: { table: 'orders', alias: 'o' },
  joins: [
    { table: 'order_lines', alias: 'l', on: 'o.id = l.order_id' },
    { table: 'code_branches', alias: 'b', on: 'o.branch_id = b.id' },
  ],
  select: [{ expr: 'o.id' }],
};

test('buildTenantNormalizedProcedure creates temp tables and shared filters', () => {
  const sql = buildTenantNormalizedProcedure({
    name: 'orders_report',
    report: baseReport,
    tenantTableFlags: {
      orders: { isShared: 0 },
      order_lines: { isShared: 0 },
      code_branches: { isShared: 1 },
    },
  });

  assert.ok(
    sql.includes(
      "CALL create_tenant_temp_table('orders', 'tmp_orders', session_company_id);",
    ),
  );
  assert.ok(
    sql.includes(
      "CALL create_tenant_temp_table('order_lines', 'tmp_order_lines', session_company_id);",
    ),
  );
  assert.ok(sql.includes('FROM tmp_orders o'));
  assert.ok(sql.includes('JOIN tmp_order_lines l'));
  assert.ok(sql.includes('JOIN code_branches b'));
  assert.ok(sql.includes('b.company_id IN (0, session_company_id)'));
  assert.ok(sql.includes('IN session_company_id INT'));
});

test('buildTenantNormalizedProcedure replaces union tables and warns on unknown', () => {
  const warnings = [];
  const sql = buildTenantNormalizedProcedure({
    name: 'orders_union',
    report: {
      ...baseReport,
      joins: [
        { table: 'unknown_table', alias: 'u', on: 'o.id = u.order_id' },
      ],
      unions: [
        {
          from: { table: 'orders_archive', alias: 'oa' },
          select: [{ expr: 'oa.id' }],
        },
      ],
    },
    tenantTableFlags: {
      orders: { isShared: 0 },
      orders_archive: { isShared: 0 },
    },
    logger: {
      warn: (msg) => warnings.push(msg),
    },
  });

  assert.ok(sql.includes('FROM tmp_orders o'));
  assert.ok(sql.includes('FROM tmp_orders_archive oa'));
  assert.ok(sql.includes('JOIN unknown_table u'));
  assert.ok(warnings.some((msg) => msg.includes('unknown_table')));
});

test('buildTenantNormalizedProcedure normalizes tables in subquery FROM', () => {
  const sql = buildTenantNormalizedProcedure({
    name: 'orders_filtered',
    report: {
      from: {
        table: '(SELECT * FROM orders WHERE orders.status = \"open\")',
        alias: 'o',
      },
      select: [{ expr: 'o.id' }],
    },
    tenantTableFlags: {
      orders: { isShared: 0 },
    },
  });

  assert.ok(
    sql.includes(
      "CALL create_tenant_temp_table('orders', 'tmp_orders', session_company_id);",
    ),
  );
  assert.ok(sql.includes('FROM (SELECT * FROM tmp_orders'));
});
