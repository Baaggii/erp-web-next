import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listReportWorkplaces,
  __setGetEmploymentSessions,
  __resetGetEmploymentSessions,
} from '../../api-server/controllers/reportController.js';

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
      workplace_session_id: '101',
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
      workplace_session_id: '101',
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
      workplace_session_id: '202',
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
      workplace_session_id: '303',
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
      workplace_session_id: null,
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
      workplace_session_id: 101,
      workplaceSessionId: 101,
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
      workplace_session_id: 202,
      workplaceSessionId: 202,
    },
  ]);
});

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
        workplace_session_id: 101,
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

test('listReportWorkplaces allows overriding employee via query parameter', async () => {
  let capturedEmpId = null;
  __setGetEmploymentSessions(async (empId) => {
    capturedEmpId = empId;
    return [];
  });

  const req = {
    user: { empid: 11, companyId: null },
    query: { year: '2024', month: '2', employeeId: '77' },
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
  assert.equal(capturedEmpId, 77);
});

test('listReportWorkplaces rejects requests without employee context', async () => {
  const req = {
    user: { empid: null, employeeId: null },
    query: { year: '2024', month: '1' },
  };
  const res = createRes();

  await listReportWorkplaces(req, res, (err) => {
    throw err || new Error('next should not be called');
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { message: 'Missing employee context' });
});
