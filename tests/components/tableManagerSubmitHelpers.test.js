import test from 'node:test';
import assert from 'node:assert/strict';

function createState(initial = {}) {
  return { ...initial };
}

test('submitEditRequest submits payload and resets state on success', async () => {
  const { submitEditRequest } = await import(
    '../../src/erp.mgt.mn/components/tableManagerSubmissions.js',
  );

  const cleaned = { field: 'value' };
  const states = createState({
    showForm: true,
    editing: { id: 7 },
    isAdding: true,
    gridRows: [1],
    requestType: 'edit',
  });

  const toasts = [];
  const fetchCalls = [];

  const result = await submitEditRequest(cleaned, {
    promptRequestReason: async () => 'Because',
    addToast: (message, type) => toasts.push({ message, type }),
    t: (_key, fallback) => fallback,
    table: 'finance',
    editing: states.editing,
    setShowForm: (value) => {
      states.showForm = value;
    },
    setEditing: (value) => {
      states.editing = value;
    },
    setIsAdding: (value) => {
      states.isAdding = value;
    },
    setGridRows: (value) => {
      states.gridRows = value;
    },
    setRequestType: (value) => {
      states.requestType = value;
    },
    getRowId: (row) => row.id,
    API_BASE: '/api',
    fetchImpl: async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, status: 200 };
    },
  });

  assert.equal(result, true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/api/pending_request');
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), {
    table_name: 'finance',
    record_id: 7,
    request_type: 'edit',
    request_reason: 'Because',
    proposed_data: cleaned,
  });
  assert.equal(states.showForm, false);
  assert.equal(states.editing, null);
  assert.equal(states.isAdding, false);
  assert.deepEqual(states.gridRows, []);
  assert.equal(states.requestType, null);
  assert.deepEqual(toasts, [
    { message: 'Edit request submitted', type: 'success' },
  ]);
});

test('submitNewRow posts payload with created fields and refreshes data', async () => {
  const { submitNewRow } = await import(
    '../../src/erp.mgt.mn/components/tableManagerSubmissions.js',
  );

  const cleaned = { amount: 100 };
  const states = createState({
    showForm: true,
    editing: { id: 5 },
    isAdding: true,
    gridRows: [{ id: 1 }],
    selectedRows: new Set([1]),
    openAddCount: 0,
    rows: [],
    count: 0,
    loggedRows: null,
    toasts: [],
  });

  const toasts = [];
  const fetchCalls = [];
  let fetchStep = 0;
  const fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url, init });
    if (fetchStep === 0) {
      fetchStep += 1;
      assert.equal(init.method, 'POST');
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 10 }),
      };
    }
    fetchStep += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ rows: [{ id: 10 }], total: 1 }),
    };
  };

  const result = await submitNewRow(cleaned, {
    columns: new Set(['created_by', 'created_at', 'company_id']),
    user: { empid: 'EMP001' },
    formatTimestamp: () => '2024-01-02 03:04:05',
    fetchImpl,
    table: 'finance records',
    page: 2,
    perPage: 25,
    company: 11,
    sort: { column: 'amount', dir: 'asc' },
    filters: { status: 'pending', empty: '' },
    setRows: (rows) => {
      states.rows = rows;
    },
    setCount: (count) => {
      states.count = count;
    },
    logRowsMemory: (rows) => {
      states.loggedRows = rows;
    },
    setSelectedRows: (value) => {
      states.selectedRows = value;
    },
    setShowForm: (value) => {
      states.showForm = value;
    },
    setEditing: (value) => {
      states.editing = value;
    },
    setIsAdding: (value) => {
      states.isAdding = value;
    },
    setGridRows: (value) => {
      states.gridRows = value;
    },
    addToast: (message, type) => {
      toasts.push({ message, type });
    },
    openAdd: () => {
      states.openAddCount += 1;
    },
    formConfig: {},
    merged: { amount: 100 },
    buildImageName: () => ({ name: '' }),
    columnCaseMap: {},
    getRowId: (row) => row.id,
    getImageFolder: () => 'finance',
    oldImageName: '',
  });

  assert.equal(result, true);
  assert.equal(fetchCalls.length, 2);
  assert.equal(
    fetchCalls[0].url,
    '/api/tables/finance%20records',
  );
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), {
    amount: 100,
    created_by: 'EMP001',
    created_at: '2024-01-02 03:04:05',
  });
  assert.match(fetchCalls[1].url, /\?page=2&perPage=25/);
  assert.deepEqual(states.rows, [{ id: 10 }]);
  assert.equal(states.count, 1);
  assert.deepEqual(states.loggedRows, [{ id: 10 }]);
  assert.equal(states.showForm, false);
  assert.equal(states.editing, null);
  assert.equal(states.isAdding, false);
  assert.deepEqual(states.gridRows, []);
  assert.deepEqual([...states.selectedRows], []);
  assert.deepEqual(toasts, [
    { message: 'Шинэ гүйлгээ хадгалагдлаа', type: 'success' },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(states.openAddCount, 1);
});

test('submitUpdate updates payload and refreshes data', async () => {
  const { submitUpdate } = await import(
    '../../src/erp.mgt.mn/components/tableManagerSubmissions.js',
  );

  const cleaned = { amount: 150 };
  const states = createState({
    showForm: true,
    editing: { id: 20 },
    isAdding: true,
    gridRows: [{ id: 20 }],
    rows: [],
    count: 0,
    loggedRows: null,
    selectedRows: new Set([20]),
  });

  const toasts = [];
  const fetchCalls = [];
  let fetchStep = 0;
  const fetchImpl = async (url, init = {}) => {
    fetchCalls.push({ url, init });
    if (fetchStep === 0) {
      fetchStep += 1;
      assert.equal(init.method, 'PUT');
      return { ok: true, status: 200 };
    }
    fetchStep += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ rows: [{ id: 20, amount: 150 }], total: 1 }),
    };
  };

  const result = await submitUpdate(cleaned, {
    fetchImpl,
    table: 'finance',
    editing: states.editing,
    getRowId: (row) => row.id,
    page: 1,
    perPage: 10,
    company: null,
    columns: new Set(),
    sort: { column: 'amount', dir: 'desc' },
    filters: { status: 'approved' },
    setRows: (rows) => {
      states.rows = rows;
    },
    setCount: (count) => {
      states.count = count;
    },
    logRowsMemory: (rows) => {
      states.loggedRows = rows;
    },
    setSelectedRows: (value) => {
      states.selectedRows = value;
    },
    setShowForm: (value) => {
      states.showForm = value;
    },
    setEditing: (value) => {
      states.editing = value;
    },
    setIsAdding: (value) => {
      states.isAdding = value;
    },
    setGridRows: (value) => {
      states.gridRows = value;
    },
    addToast: (message, type) => {
      toasts.push({ message, type });
    },
  });

  assert.equal(result, true);
  assert.equal(fetchCalls.length, 2);
  assert.equal(
    fetchCalls[0].url,
    '/api/tables/finance/20',
  );
  assert.deepEqual(JSON.parse(fetchCalls[0].init.body), cleaned);
  assert.match(fetchCalls[1].url, /sort=amount&dir=desc/);
  assert.deepEqual(states.rows, [{ id: 20, amount: 150 }]);
  assert.equal(states.count, 1);
  assert.deepEqual(states.loggedRows, [{ id: 20, amount: 150 }]);
  assert.equal(states.showForm, false);
  assert.equal(states.editing, null);
  assert.equal(states.isAdding, false);
  assert.deepEqual(states.gridRows, []);
  assert.deepEqual([...states.selectedRows], []);
  assert.deepEqual(toasts, [{ message: 'Хадгалагдлаа', type: 'success' }]);
});
