import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { listPermittedProcedures } from '../../api-server/utils/reportProcedures.js';
import { tenantConfigPath } from '../../api-server/utils/configPaths.js';
import { pool } from '../../db/index.js';

async function writeJsonConfig(companyId, relativePath, data) {
  const filePath = tenantConfigPath(relativePath, companyId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

test('listPermittedProcedures merges trigger procedures and respects filters', async () => {
  const companyId = 4321;
  await writeJsonConfig(companyId, 'transactionForms.json', {
    tbl_sales: {
      SalesForm: {
        procedures: ['form_proc'],
      },
    },
  });
  await writeJsonConfig(companyId, 'report_management/allowedReports.json', {
    restricted_trigger: { branches: [99], departments: [], permissions: [] },
  });
  await writeJsonConfig(companyId, 'tableDisplayFields.json', {
    companies: { idField: 'id', displayFields: ['name'] },
    code_branches: { idField: 'branch_id', displayFields: ['name'] },
    code_department: { idField: 'id', displayFields: ['name'] },
    tbl_employee: { idField: 'emp_id', displayFields: ['emp_fname'] },
  });

  const triggerTables = [];
  const origQuery = pool.query;
  pool.query = async (sql, params) => {
    if (typeof sql === 'string' && sql.startsWith('SHOW TRIGGERS')) {
      triggerTables.push(params?.[0]);
      return [[{ Statement: 'CALL trigger_proc(NEW.id); CALL restricted_trigger(NEW.id);' }]];
    }
    if (typeof sql === 'string' && sql.includes('FROM tbl_employment')) {
      return [[
        {
          company_id: companyId,
          company_name: 'Acme Co',
          branch_id: 1,
          branch_name: 'HQ',
          department_id: 2,
          department_name: 'Operations',
          position_id: 0,
          senior_empid: null,
          senior_plan_empid: null,
          employee_name: 'Tester',
          user_level: 5,
          user_level_name: 'Level 5',
          permission_list: '',
        },
      ]];
    }
    return [[ ]];
  };

  try {
    const base = await listPermittedProcedures({}, companyId, { empid: 'emp1' });
    assert.deepEqual([...new Set(triggerTables)], ['tbl_sales']);
    const baseNames = base.procedures.map((p) => p.name).sort();
    assert.deepEqual(baseNames, ['form_proc', 'trigger_proc']);

    const prefixed = await listPermittedProcedures({ prefix: 'trigger' }, companyId, {
      empid: 'emp1',
    });
    assert.deepEqual(prefixed.procedures.map((p) => p.name), ['trigger_proc']);

    const none = await listPermittedProcedures({ prefix: 'missing' }, companyId, {
      empid: 'emp1',
    });
    assert.equal(none.procedures.length, 0);
  } finally {
    pool.query = origQuery;
    await fs.rm(path.join(process.cwd(), 'config', String(companyId)), {
      recursive: true,
      force: true,
    });
  }
});
