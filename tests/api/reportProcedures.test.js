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
    deleted_proc: { branches: [], departments: [], permissions: [] },
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
      return [[{ Statement: 'CALL trigger_proc(NEW.id); CALL deleted_proc(NEW.id);' }]];
    }
    if (
      typeof sql === 'string' &&
      sql.includes('FROM information_schema.ROUTINES')
    ) {
      const search = Array.isArray(params) && params[0]
        ? params[0].replace(/%/g, '')
        : '';
      if (!search) {
        return [[
          { ROUTINE_NAME: 'form_proc' },
          { ROUTINE_NAME: 'trigger_proc' },
        ]];
      }
      if (search === 'trigger') {
        return [[{ ROUTINE_NAME: 'trigger_proc' }]];
      }
      return [[]];
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
    assert.ok(!baseNames.includes('deleted_proc'));

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

test('listPermittedProcedures filters by position visibility rules', async () => {
  const companyId = 13579;
  await writeJsonConfig(companyId, 'transactionForms.json', {
    tbl_reports: {
      Summary: {
        procedures: ['position_proc'],
      },
    },
  });
  await writeJsonConfig(companyId, 'report_management/allowedReports.json', {
    position_proc: { branches: [], departments: [], workplaces: [], positions: [9], permissions: [] },
  });

  let positionId = 4;
  const origQuery = pool.query;
  pool.query = async (sql, params) => {
    if (typeof sql === 'string' && sql.startsWith('SHOW TRIGGERS')) {
      return [[]];
    }
    if (
      typeof sql === 'string' &&
      sql.includes('FROM information_schema.ROUTINES')
    ) {
      return [[
        { ROUTINE_NAME: 'position_proc' },
      ]];
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
          position_id: positionId,
          employment_position_id: positionId,
          senior_empid: null,
          senior_plan_empid: null,
          workplace_id: 5,
          employee_name: 'Tester',
          user_level: 7,
          user_level_name: 'Level 7',
          permission_list: '',
        },
      ]];
    }
    return [[ ]];
  };

  try {
    const { procedures: deniedProcedures } = await listPermittedProcedures({}, companyId, {
      empid: 'emp-position',
    });
    const deniedNames = deniedProcedures.map((p) => p.name);
    assert.ok(!deniedNames.includes('position_proc'));

    positionId = 9;
    const { procedures: allowedProcedures } = await listPermittedProcedures({}, companyId, {
      empid: 'emp-position',
    });
    const allowedNames = allowedProcedures.map((p) => p.name);
    assert.ok(allowedNames.includes('position_proc'));
  } finally {
    pool.query = origQuery;
    await fs.rm(path.join(process.cwd(), 'config', String(companyId)), {
      recursive: true,
      force: true,
    });
  }
});

test('listPermittedProcedures hides procedures without visibility rules', async () => {
  const companyId = 6789;
  await writeJsonConfig(companyId, 'transactionForms.json', {
    tbl_reports: {
      Summary: {
        procedures: ['empty_proc', 'visible_proc'],
      },
    },
  });
  await writeJsonConfig(companyId, 'report_management/allowedReports.json', {
    empty_proc: { branches: [], departments: [], permissions: [] },
    visible_proc: { branches: [], departments: [], permissions: [5] },
  });

  const origQuery = pool.query;
  pool.query = async (sql, params) => {
    if (typeof sql === 'string' && sql.startsWith('SHOW TRIGGERS')) {
      return [[]];
    }
    if (
      typeof sql === 'string' &&
      sql.includes('FROM information_schema.ROUTINES')
    ) {
      return [[
        { ROUTINE_NAME: 'empty_proc' },
        { ROUTINE_NAME: 'visible_proc' },
      ]];
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
    const { procedures } = await listPermittedProcedures({}, companyId, {
      empid: 'emp-visibility',
    });
    const names = procedures.map((p) => p.name).sort();
    assert.ok(!names.includes('empty_proc'));
    assert.ok(names.includes('visible_proc'));
  } finally {
    pool.query = origQuery;
    await fs.rm(path.join(process.cwd(), 'config', String(companyId)), {
      recursive: true,
      force: true,
    });
  }
});
