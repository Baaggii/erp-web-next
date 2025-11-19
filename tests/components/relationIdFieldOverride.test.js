import test from 'node:test';
import assert from 'node:assert/strict';

if (!global.document) {
  global.document = { createElement: () => ({}) };
} else if (!global.document.createElement) {
  global.document.createElement = () => ({});
}

if (!global.window) {
  global.window = {};
}
if (!global.window.addEventListener) global.window.addEventListener = () => {};
if (!global.window.removeEventListener) global.window.removeEventListener = () => {};
if (!global.window.dispatchEvent) global.window.dispatchEvent = () => {};
if (!global.window.confirm) global.window.confirm = () => true;

let React;
let act;
let createRoot;
let haveReact = true;
try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
} catch {
  haveReact = false;
}

if (!haveReact) {
  test('TableManager handles relation idField overrides', { skip: true }, () => {});
  test('RowFormModal uses relation idField for search column', { skip: true }, () => {});
} else {
  test('TableManager applies relation idField override to labels and RowFormModal', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id' },
            { name: 'other_id' },
          ],
        };
      }
      if (url === '/api/tables/test/relations') {
        return {
          ok: true,
          json: async () => [
            {
              COLUMN_NAME: 'other_id',
              REFERENCED_TABLE_NAME: 'other_table',
              REFERENCED_COLUMN_NAME: 'id',
            },
          ],
        };
      }
      if (url.startsWith('/api/display_fields?table=other_table')) {
        return {
          ok: true,
          json: async () => ({ idField: 'code', displayFields: ['name'] }),
        };
      }
      if (url.startsWith('/api/tenant_tables/other_table')) {
        return {
          ok: true,
          json: async () => ({ tenantKeys: ['company_id'] }),
        };
      }
      if (url.startsWith('/api/tables/other_table?')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              { id: 1, code: 'A123', name: 'Alpha' },
            ],
            count: 1,
          }),
        };
      }
      if (url.startsWith('/api/tables/other_table/columns')) {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/display_fields?table=')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.startsWith('/api/proc_triggers?table=test')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.startsWith('/api/tables/test?')) {
        return { ok: true, json: async () => ({ rows: [], count: 0 }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    let receivedRelationConfigs = null;
    let receivedRelations = null;
    const { default: TableManager } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableManager.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({ company: 1 }),
        },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: () => {} }),
        },
        './RowFormModal.jsx': {
          default: (props) => {
            receivedRelationConfigs = props.relationConfigs;
            receivedRelations = props.relations;
            return null;
          },
        },
        './CascadeDeleteModal.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageViewModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        './ImageSearchModal.jsx': { default: () => null },
        './Modal.jsx': { default: () => null },
        './CustomDatePicker.jsx': { default: () => null },
        '../hooks/useGeneralConfig.js': { default: () => ({}) },
        '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
        '../utils/buildImageName.js': { default: () => ({}) },
        '../utils/slugify.js': { default: () => '' },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(TableManager, { table: 'test' }));
      });
      for (let i = 0; i < 10; i += 1) {
        if (
          receivedRelationConfigs?.other_id &&
          receivedRelations?.other_id &&
          Array.from(
            container.querySelectorAll('select option'),
          ).some((opt) => opt.value)
        ) {
          break;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      assert.ok(receivedRelationConfigs);
      assert.equal(receivedRelationConfigs.other_id?.idField, 'code');
      assert.deepEqual(receivedRelationConfigs.other_id?.displayFields, ['name']);
      assert.ok(receivedRelations);
      assert.deepEqual(receivedRelations.other_id, [
        { value: 1, label: 'A123 - Alpha' },
      ]);
      const option = Array.from(
        container.querySelectorAll('select option'),
      ).find((opt) => opt.value === '1');
      assert.ok(option);
      assert.equal(option.textContent, 'A123 - Alpha');
    } finally {
      root.unmount();
      global.fetch = origFetch;
    }
  });

  test('RowFormModal uses relation idField for AsyncSearchSelect search column', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.startsWith('/api/display_fields')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const selectProps = [];
    const AsyncSearchSelectMock = (props) => {
      selectProps.push(props);
      return React.createElement('div', null, 'select');
    };

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: AsyncSearchSelectMock },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (p) => React.createElement('div', p) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: {},
            company: 1,
            branch: 1,
            department: 1,
            userSettings: {},
          }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['other_id'],
            row: {},
            relationConfigs: {
              other_id: {
                table: 'other_table',
                column: 'id',
                idField: 'code',
                displayFields: ['name'],
              },
            },
            labels: { other_id: 'Other' },
            fieldTypeMap: { other_id: 'string' },
          }),
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(selectProps[0]);
      assert.equal(selectProps[0].searchColumn, 'code');
      assert.deepEqual(selectProps[0].searchColumns, ['code', 'name']);
    } finally {
      root.unmount();
      global.fetch = origFetch;
    }
  });

  test('RowFormModal passes combination filters to AsyncSearchSelect', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const selectProps = [];
    const AsyncSearchSelectMock = (props) => {
      selectProps.push(props);
      return React.createElement('div', null, 'async');
    };

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: AsyncSearchSelectMock },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (p) => React.createElement('div', p) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: {},
            company: 1,
            branch: 1,
            department: 1,
            userSettings: {},
          }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['company_id', 'dept_id'],
            row: { company_id: 'COMP-1' },
            relationConfigs: {
              dept_id: {
                table: 'departments',
                column: 'id',
                combinationSourceColumn: 'company_id',
                combinationTargetColumn: 'company_id',
              },
            },
            labels: { dept_id: 'Dept' },
            fieldTypeMap: { company_id: 'string', dept_id: 'string' },
          }),
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(selectProps[0]);
      assert.deepEqual(selectProps[0].filters, { company_id: 'COMP-1' });
    } finally {
      root.unmount();
      global.fetch = origFetch;
    }
  });

  test('RowFormModal filters relation select options using combination targets', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => React.createElement('div', null, 'async') },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (p) => React.createElement('div', p) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: {},
            company: 1,
            branch: 1,
            department: 1,
            userSettings: {},
          }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['company_id', 'dept_id'],
            row: { company_id: 'COMP-1' },
            relations: {
              dept_id: [
                { value: '1', label: 'North' },
                { value: '2', label: 'South' },
              ],
            },
            relationData: {
              dept_id: {
                '1': { id: '1', company_id: 'COMP-1' },
                '2': { id: '2', company_id: 'COMP-2' },
              },
            },
            relationConfigs: {
              dept_id: {
                table: 'departments',
                column: 'id',
                combinationSourceColumn: 'company_id',
                combinationTargetColumn: 'company_id',
              },
            },
            labels: { dept_id: 'Dept' },
            fieldTypeMap: { company_id: 'string', dept_id: 'string' },
          }),
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const select = container.querySelector('select');
      assert.ok(select, 'expected relation select to render');
      const values = Array.from(select.querySelectorAll('option')).map((opt) => opt.value);
      assert.deepEqual(values, ['', '1']);
    } finally {
      root.unmount();
      global.fetch = origFetch;
    }
  });

  test('RowFormModal shows relation idField value for disabled fields', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => React.createElement('div', null, 'select') },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': {
          default: (props) => React.createElement('div', props),
        },
        './Modal.jsx': {
          default: ({ children }) => React.createElement('div', null, children),
        },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: {},
            company: 1,
            branch: 1,
            department: 1,
            userSettings: {},
          }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: () => {} },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['other_id'],
            row: { other_id: 1 },
            relationConfigs: {
              other_id: {
                table: 'other_table',
                column: 'id',
                idField: 'code',
                displayFields: ['name'],
              },
            },
            relationData: {
              other_id: {
                1: { ID: 1, CODE: 'A123', name: 'Alpha' },
              },
            },
            disabledFields: ['other_id'],
            labels: { other_id: 'Other' },
            fieldTypeMap: { other_id: 'string' },
          }),
        );
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const text = container.textContent || '';
      assert.ok(text.includes('A123 - Alpha'));
      assert.ok(!text.includes('1 - Alpha'));
    } finally {
      root.unmount();
      global.fetch = origFetch;
    }
  });

  test('RowFormModal skips procedure call until required parameters are filled', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const callProcedureMock = t.mock.fn(async () => ({ HeaderField: 'HDR-001' }));

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (p) => React.createElement('div', p) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: { empid: 'EMP-1' },
            company: 'COMP-1',
            branch: 'BR-1',
            department: 'DEP-1',
            userSettings: {},
          }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: callProcedureMock },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['SessionDate', 'ItemCode'],
            row: { SessionDate: '', ItemCode: '' },
            relations: {},
            relationConfigs: {},
            relationData: {},
            fieldTypeMap: { SessionDate: 'date' },
            disabledFields: [],
            labels: { SessionDate: 'Session Date', ItemCode: 'Item' },
            requiredFields: [],
            onChange: () => {},
            onRowsChange: () => {},
            headerFields: [],
            footerFields: [],
            mainFields: [],
            userIdFields: [],
            branchIdFields: [],
            departmentIdFields: [],
            companyIdFields: [],
            totalAmountFields: [],
            totalCurrencyFields: [],
            defaultValues: {},
            dateField: ['SessionDate'],
            inline: false,
            useGrid: false,
            fitted: false,
            table: '',
            imagenameField: [],
            imageIdField: '',
            scope: 'forms',
            procTriggers: {
              itemcode: {
                name: 'set_header',
                params: ['$current', 'SessionDate'],
                outMap: { '$current': 'ItemCode' },
              },
            },
          }),
        );
      });

      await act(async () => {});

      const inputs = container.querySelectorAll('input');
      assert.ok(inputs.length >= 2, 'should render inputs for session date and item');
      const dateInput = inputs[0];
      const itemInput = inputs[1];

      await act(async () => {
        itemInput.value = 'ITEM-01';
        itemInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        itemInput.dispatchEvent(event);
        await Promise.resolve();
      });

      assert.equal(callProcedureMock.mock.callCount(), 0, 'procedure should not run with empty date');
      assert.equal(
        document.activeElement,
        dateInput,
        'missing session date should receive focus',
      );

      await act(async () => {
        dateInput.value = '2024-02-01';
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        itemInput.dispatchEvent(event);
        await Promise.resolve();
      });

      assert.equal(callProcedureMock.mock.callCount(), 1, 'procedure should run after filling date');
      const [procName, params] = callProcedureMock.mock.calls[0].arguments;
      assert.equal(procName, 'set_header');
      assert.deepEqual(params, ['ITEM-01', '2024-02-01']);
    } finally {
      await act(async () => {
        root.unmount();
      });
      global.fetch = origFetch;
    }
  });

  test('RowFormModal cascades procedure triggers sequentially', async (t) => {
    const origFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const callProcedureMock = t.mock.fn(async (name, params) => {
      if (name === 'fill_intermediate') {
        return { IntermediateField: 'MID-200' };
      }
      if (name === 'fill_final') {
        return { FinalField: `FIN-${params[0]}` };
      }
      return {};
    });

    const { default: RowFormModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowFormModal.jsx',
      {
        './AsyncSearchSelect.jsx': { default: () => null },
        './InlineTransactionTable.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './TooltipWrapper.jsx': { default: (p) => React.createElement('div', p) },
        './Modal.jsx': { default: ({ children }) => React.createElement('div', null, children) },
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: { empid: 'EMP-1' },
            company: 'COMP-1',
            branch: 'BR-1',
            department: 'DEP-1',
            userSettings: {},
          }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ forms: {}, general: {} }) },
        '../utils/formatTimestamp.js': { default: () => '2024-05-01 12:34:56' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/callProcedure.js': { default: callProcedureMock },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(RowFormModal, {
            visible: true,
            onCancel: () => {},
            onSubmit: () => {},
            columns: ['ItemCode', 'IntermediateField', 'FinalField'],
            row: { ItemCode: '', IntermediateField: '', FinalField: '' },
            relations: {},
            relationConfigs: {},
            relationData: {},
            fieldTypeMap: {},
            disabledFields: [],
            labels: {
              ItemCode: 'Item',
              IntermediateField: 'Intermediate',
              FinalField: 'Final',
            },
            requiredFields: [],
            onChange: () => {},
            onRowsChange: () => {},
            headerFields: [],
            footerFields: [],
            mainFields: [],
            userIdFields: [],
            branchIdFields: [],
            departmentIdFields: [],
            companyIdFields: [],
            totalAmountFields: [],
            totalCurrencyFields: [],
            defaultValues: {},
            dateField: [],
            inline: false,
            useGrid: false,
            fitted: false,
            table: '',
            imagenameField: [],
            imageIdField: '',
            scope: 'forms',
            procTriggers: {
              itemcode: {
                name: 'fill_intermediate',
                params: ['$current'],
                outMap: { '$current': 'IntermediateField' },
              },
              intermediatefield: {
                name: 'fill_final',
                params: ['$current'],
                outMap: { '$current': 'FinalField' },
              },
            },
          }),
        );
      });

      await act(async () => {});

      const inputs = container.querySelectorAll('input');
      assert.ok(inputs.length >= 3, 'should render inputs for all fields');
      const itemInput = inputs[0];
      const intermediateInput = inputs[1];
      const finalInput = inputs[2];

      await act(async () => {
        itemInput.value = 'ITEM-02';
        itemInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        itemInput.dispatchEvent(event);
        await Promise.resolve();
      });

      assert.equal(callProcedureMock.mock.callCount(), 2);
      assert.equal(intermediateInput.value, 'MID-200');
      assert.equal(finalInput.value, 'FIN-MID-200');
    } finally {
      await act(async () => {
        root.unmount();
      });
      global.fetch = origFetch;
    }
  });
}
