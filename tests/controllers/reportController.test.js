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
      company_name: 'Alpha',
      branch_id: '1',
      branch_name: 'Main',
      department_id: '2',
      department_name: 'Sales',
      workplace_id: '5',
      workplace_name: 'HQ',
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
      department_name: null,
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
      company_name: 'Alpha',
      branch_id: 1,
      branch_name: 'Main',
      department_id: 2,
      department_name: 'Sales',
      workplace_id: 5,
      workplace_name: 'HQ',
      workplace_session_id: 101,
    },
    {
      company_id: 2,
      company_name: 'Beta',
      branch_id: null,
      branch_name: null,
      department_id: null,
      department_name: null,
      workplace_id: 7,
      workplace_name: 'Shop',
      workplace_session_id: 202,
    },
  ]);
});
