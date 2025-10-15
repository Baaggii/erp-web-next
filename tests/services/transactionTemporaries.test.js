import test from 'node:test';
import assert from 'node:assert/strict';
import * as db from '../../db/index.js';
import {
  getTemporarySummary,
  sanitizeCleanedValuesForInsert,
  populateReviewerAutoFields,
} from '../../api-server/services/transactionTemporaries.js';

function mockQuery(handler) {
  const original = db.pool.query;
  db.pool.query = handler;
  return () => {
    db.pool.query = original;
  };
}

test('getTemporarySummary marks reviewers even without pending temporaries', async () => {
  const restore = mockQuery(async (sql) => {
    if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) {
      return [[], []];
    }
    if (sql.includes('WHERE created_by = ?')) {
      return [[{ pending_cnt: 0, total_cnt: 1 }]];
    }
    if (sql.includes('WHERE plan_senior_empid = ?')) {
      return [[{ pending_cnt: 0, total_cnt: 2 }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  try {
    const summary = await getTemporarySummary('EMP001', 1);
    assert.equal(summary.createdPending, 0);
    assert.equal(summary.reviewPending, 0);
    assert.equal(summary.isReviewer, true);
  } finally {
    restore();
  }
});

test('sanitizeCleanedValuesForInsert trims oversized string values and records warnings', async () => {
  const columns = [
    { name: 'g_burtgel_id', type: 'varchar', maxLength: 10 },
    { name: 'g_id', type: 'int', maxLength: null },
  ];
  const input = {
    g_burtgel_id: ' 123456789012345 ',
    rows: [{ dummy: true }],
  };

  const result = await sanitizeCleanedValuesForInsert(
    'transactions_contract',
    input,
    columns,
  );

  assert.deepEqual(result.values, { g_burtgel_id: '1234567890' });
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].column, 'g_burtgel_id');
  assert.equal(result.warnings[0].type, 'maxLength');
  assert.equal(result.warnings[0].maxLength, 10);
  assert.equal(result.warnings[0].actualLength, 15);
});

test('populateReviewerAutoFields keeps creator and injects reviewer context', () => {
  const columns = [
    { name: 'Amount' },
    { name: 'Emp_Id' },
    { name: 'Branch_Id' },
    { name: 'Department_Id' },
    { name: 'Company_Id' },
    { name: 'Created_By' },
  ];
  const formConfig = {
    userIdFields: ['EmpID', 'created_by'],
    branchIdFields: ['BranchID'],
    departmentIdFields: ['DepartmentID'],
    companyIdFields: ['CompanyID'],
  };
  const initialValues = {
    Amount: 1500,
    Created_By: 'EMP001',
    Emp_Id: 'EMP001',
  };

  const result = populateReviewerAutoFields({
    initialValues,
    columns,
    formConfig,
    reviewerEmpId: 'SENIOR1',
    reviewerBranchId: 201,
    reviewerDepartmentId: 301,
    reviewerCompanyId: 401,
    fallbackCreator: 'EMP001',
    fallbackBranchId: 10,
    fallbackDepartmentId: 20,
  });

  assert.equal(result.created_by, 'EMP001');
  assert.equal(result.Emp_Id, 'SENIOR1');
  assert.equal(result.Branch_Id, 201);
  assert.equal(result.Department_Id, 301);
  assert.equal(result.Company_Id, 401);
  assert.equal(result.Amount, 1500);
});
