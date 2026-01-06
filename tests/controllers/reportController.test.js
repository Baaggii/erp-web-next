import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listReportWorkplaces,
  __setGetEmploymentSessions,
  __resetGetEmploymentSessions,
} from '../../api-server/controllers/reportController.js';

process.env.SKIP_WORKPLACE_COLUMN_CHECK = '1';
process.env.SKIP_POS_RELATION_CHECK = '1';

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
    },
  };
}

test('listReportWorkplaces dedupes workplace assignments', async () => {
  __setGetEmploymentSessions(async () => [
    {
      company_id: 1,
      company_name: 'Alpha  ',
      branch_id: '1',
      branch_name: '  Main ',
      department_id: '2',
      department_name: 'Sales',
      workplace_id: '5',
      workplace_name: 'HQ  ',
    },
    {
      company_id: 1,
      company_name: 'Alpha',
      branch_id: '3',
      branch_name: 'Secondary',
      department_id: '2',
      department_name: 'Sales',
      workplace_id: '5',
      workplace_name: 'HQ',
    },
    {
      company_id: 2,
      company_name: 'Beta',
      branch_id: null,
      branch_name: null,
      department_id: null,
      department_name: '  ',
      workplace_id: '7',
      workplace_name: 'Shop',
    },
    {
      company_id: 2,
      company_name: 'Beta',
      branch_id: null,
      branch_name: null,
      department_id: null,
      department_name: null,
      workplace_id: null,
      workplace_name: 'Ghost',
    },
    {
      company_id: 2,
      company_name: 'Beta',
      branch_id: null,
      branch_name: null,
      department_id: null,
      department_name: null,
      workplace_id: '7',
      workplace_name: 'Shop',
    },
  ]);

  const req = {
    user: { empid: 99, companyId: null },
    query: { year: '2024', month: '4' },
  };
  const res = createRes();

  try {
    await listReportWorkplaces(req, res, (err) => {
      throw err || new Error('next should not be called');
    });
  } finally {
    __resetGetEmploymentSessions();
  }

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload);
  assert.deepEqual(res.payload.assignments, [
    {
      company_id: 1,
      companyId: 1,
      company_name: 'Alpha',
      companyName: 'Alpha',
      branch_id: 1,
      branchId: 1,
      branch_name: 'Main',
      branchName: 'Main',
      department_id: 2,
      departmentId: 2,
      department_name: 'Sales',
      departmentName: 'Sales',
      workplace_id: 5,
      workplaceId: 5,
      workplace_name: 'HQ',
      workplaceName: 'HQ',
      workplace_effective_month: null,
      workplaceEffectiveMonth: null,
      workplace_position_id: null,
      workplacePositionId: null,
      workplace_position_name: null,
      workplacePositionName: null,
    },
    {
      company_id: 2,
      companyId: 2,
      company_name: 'Beta',
      companyName: 'Beta',
      branch_id: null,
      branchId: null,
      branch_name: null,
      branchName: null,
      department_id: null,
      departmentId: null,
      department_name: null,
      departmentName: null,
      workplace_id: 7,
      workplaceId: 7,
      workplace_name: 'Shop',
      workplaceName: 'Shop',
      workplace_effective_month: null,
      workplaceEffectiveMonth: null,
      workplace_position_id: null,
      workplacePositionId: null,
      workplace_position_name: null,
      workplacePositionName: null,
    },
  ]);
});

test('listReportWorkplaces exposes SQL diagnostics for workplace toasts', async () => {
  let capturedOptions = null;
  const sessions = [
    {
      company_id: 7,
      company_name: 'Sample Co',
      branch_id: 2,
      branch_name: 'North',
      department_id: 3,
      department_name: 'Ops',
      workplace_id: 11,
      workplace_name: 'Default workplace',
    },
  ];
  Object.defineProperty(sessions, '__diagnostics', {
    value: {
      sql: 'SELECT * FROM tbl_employment_schedule WHERE emp_id = ?',
      params: [99],
    },
    enumerable: false,
  });

  __setGetEmploymentSessions(async (empid, options) => {
    capturedOptions = options;
    return sessions;
  });

  const req = {
    user: { empid: 99, companyId: 7 },
    query: { year: '2024', month: '6' },
  };
  const res = createRes();

  try {
    await listReportWorkplaces(req, res, (err) => {
      throw err || new Error('next should not be called');
    });
  } finally {
    __resetGetEmploymentSessions();
  }

  assert.equal(res.statusCode, 200);
  assert.ok(capturedOptions, 'Expected getEmploymentSessions options to be captured');
  assert.equal(capturedOptions.includeDiagnostics, true);
  assert.ok(res.payload?.diagnostics, 'Diagnostics payload missing from response');
  assert.equal(
    res.payload.diagnostics.formattedSql,
    'SELECT * FROM tbl_employment_schedule WHERE emp_id = ?',
    'formattedSql should fall back to sql when formatted text is absent',
  );
  assert.equal(
    res.payload.diagnostics.sql,
    'SELECT * FROM tbl_employment_schedule WHERE emp_id = ?',
    'Original sql should be preserved for consumers that expect it',
  );
});

test(
  'listReportWorkplaces fills fallback IDs when assignments omit workplace data',
  async () => {
    __setGetEmploymentSessions(async () => [
      {
        company_id: 1,
        company_name: 'Alpha',
        branch_id: '12',
        branch_name: 'HQ',
        department_id: null,
        department_name: null,
        workplace_id: null,
        workplace_name: 'Main Office',
      },
      {
        company_id: 1,
        company_name: 'Alpha',
        branch_id: '12',
        branch_name: 'HQ',
        department_id: '34',
        department_name: 'Sales',
        workplace_id: '55',
        workplace_name: 'Main Office',
      },
    ]);

    const req = {
      user: { empid: 77, companyId: 1 },
      query: { year: '2024', month: '3' },
    };
    const res = createRes();

    try {
      await listReportWorkplaces(req, res, (err) => {
        throw err || new Error('next should not be called');
      });
    } finally {
      __resetGetEmploymentSessions();
    }

    assert.equal(res.statusCode, 200);
    assert.ok(res.payload);
    assert.deepEqual(res.payload.assignments, [
      {
        company_id: 1,
        companyId: 1,
        company_name: 'Alpha',
        companyName: 'Alpha',
        branch_id: 12,
        branchId: 12,
        branch_name: 'HQ',
        branchName: 'HQ',
        department_id: 34,
        departmentId: 34,
        department_name: 'Sales',
        departmentName: 'Sales',
        workplace_id: 55,
        workplaceId: 55,
        workplace_name: 'Main Office',
        workplaceName: 'Main Office',
        workplace_effective_month: null,
        workplaceEffectiveMonth: null,
        workplace_position_id: null,
        workplacePositionId: null,
        workplace_position_name: null,
        workplacePositionName: null,
      },
    ]);
  },
);

test('listReportWorkplaces prefers endDate when provided', async () => {
  let capturedEffectiveDate = null;
  __setGetEmploymentSessions(async (_empId, options) => {
    capturedEffectiveDate = options?.effectiveDate ?? null;
    return [
      {
        company_id: 1,
        company_name: 'Alpha',
        branch_id: 1,
        branch_name: 'Main',
        department_id: 2,
        department_name: 'Sales',
        workplace_id: 5,
        workplace_name: 'HQ',
      },
    ];
  });

  const req = {
    user: { empid: 42, companyId: 1 },
    query: { startDate: '2025-10-01', endDate: '2025-10-31', date: '2025-10-01' },
  };
  const res = createRes();

  try {
    await listReportWorkplaces(req, res, (err) => {
      throw err || new Error('next should not be called');
    });
  } finally {
    __resetGetEmploymentSessions();
  }

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload);
  assert.ok(capturedEffectiveDate instanceof Date);
  assert.equal(
    capturedEffectiveDate?.toISOString(),
    new Date(Date.UTC(2025, 9, 31)).toISOString(),
  );
  assert.equal(res.payload.assignments.length, 1);
});

test('listReportWorkplaces handles bigint identifiers from the database', async () => {
  __setGetEmploymentSessions(async () => [
    {
      company_id: 1n,
      company_name: 'MegaCorp',
      branch_id: 2n,
      branch_name: 'North',
      department_id: 3n,
      department_name: 'Ops',
      workplace_id: 4n,
      workplace_name: 'Plant',
    },
  ]);

  const req = {
    user: { empid: 123, companyId: 1 },
    query: { year: '2025', month: '7' },
  };
  const res = createRes();

  try {
    await listReportWorkplaces(req, res, (err) => {
      throw err || new Error('next should not be called');
    });
  } finally {
    __resetGetEmploymentSessions();
  }

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload);
  assert.deepEqual(res.payload.assignments, [
    {
      company_id: 1,
      companyId: 1,
      company_name: 'MegaCorp',
      companyName: 'MegaCorp',
      branch_id: 2,
      branchId: 2,
      branch_name: 'North',
      branchName: 'North',
      department_id: 3,
      departmentId: 3,
      department_name: 'Ops',
      departmentName: 'Ops',
      workplace_id: 4,
      workplaceId: 4,
      workplace_name: 'Plant',
      workplaceName: 'Plant',
      workplace_effective_month: null,
      workplaceEffectiveMonth: null,
      workplace_position_id: null,
      workplacePositionId: null,
      workplace_position_name: null,
      workplacePositionName: null,
    },
  ]);
});

test('listReportWorkplaces uses last day of month when year/month provided', async () => {
  let capturedEffectiveDate = null;
  __setGetEmploymentSessions(async (_empId, options) => {
    capturedEffectiveDate = options?.effectiveDate ?? null;
    return [];
  });

  const req = {
    user: { empid: 1, companyId: null },
    query: { year: '2024', month: '2' },
  };
  const res = createRes();

  try {
    await listReportWorkplaces(req, res, (err) => {
      throw err || new Error('next should not be called');
    });
  } finally {
    __resetGetEmploymentSessions();
  }

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload);
  assert.ok(capturedEffectiveDate instanceof Date);
  assert.equal(
    capturedEffectiveDate?.toISOString(),
    new Date(Date.UTC(2024, 1, 29)).toISOString(),
  );
});
