import test from 'node:test';
import assert from 'node:assert/strict';

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
  test('TableManager keeps relation fields enabled in add mode', { skip: true }, () => {});
} else {
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

  test('TableManager keeps relation fields enabled in add mode', async (t) => {
    const origFetch = global.fetch;
    let modalProps = null;
    const pipelineConfigs = [];
    const appliedGeneratedValues = [];
    const calcFieldCalls = [];

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/tbl_contractor/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'contractor_id', key: 'PRI' },
            { name: 'contractor_name' },
            { name: 'contract_type_id' },
            { name: 'status' },
          ],
        };
      }
      if (url === '/api/tables/tbl_contractor/relations') {
        return {
          ok: true,
          json: async () => [
            {
              COLUMN_NAME: 'contract_type_id',
              REFERENCED_TABLE_NAME: 'contract_types',
              REFERENCED_COLUMN_NAME: 'id',
            },
          ],
        };
      }
      if (url.startsWith('/api/display_fields?table=contract_types')) {
        return {
          ok: true,
          json: async () => ({ idField: 'id', displayFields: ['name'] }),
        };
      }
      if (url.startsWith('/api/tenant_tables/contract_types')) {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/contract_types?')) {
        return {
          ok: true,
          json: async () => ({ rows: [{ id: 1, name: 'Independent' }], count: 1 }),
        };
      }
      if (url.startsWith('/api/tables/tbl_contractor?')) {
        return {
          ok: true,
          json: async () => ({ rows: [], count: 0 }),
        };
      }
      if (url.startsWith('/api/tenant_tables/tbl_contractor')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.startsWith('/api/proc_triggers?table=tbl_contractor')) {
        return { ok: true, json: async () => ({}) };
      }
      if (url.startsWith('/api/display_fields?table=')) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    };

    try {
      const { default: TableManager } = await t.mock.import(
        '../../src/erp.mgt.mn/components/TableManager.jsx',
        {
          '../context/AuthContext.jsx': {
            AuthContext: React.createContext({ user: { empid: 99 }, company: 1 }),
          },
          '../context/ToastContext.jsx': {
            useToast: () => ({ addToast: () => {} }),
          },
          './RowFormModal.jsx': {
            default: (props) => {
              modalProps = props;
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
          '../utils/transactionValues.js': {
            assignArrayMetadata: (target) => target,
            createGeneratedColumnPipeline: (config) => {
              pipelineConfigs.push(config);
              return {
                evaluators: { generated_field: () => {} },
                apply: () => ({ changed: false, metadata: null }),
              };
            },
            applyGeneratedColumnsForValues: (values) => {
              appliedGeneratedValues.push(values);
              return values;
            },
          },
          '../utils/syncCalcFields.js': {
            syncCalcFields: (values) => {
              calcFieldCalls.push(values);
              return values;
            },
          },
        },
      );

      const ref = React.createRef();
      const container = document.createElement('div');
      const root = createRoot(container);

      await act(async () => {
        root.render(
          React.createElement(TableManager, {
            table: 'tbl_contractor',
            ref,
            buttonPerms: { 'New transaction': true },
            formConfig: {
              headerFields: ['contractor_id', 'contractor_name', 'contract_type_id'],
              editableFields: ['contractor_name'],
              defaultValues: { status: 'Active' },
            },
          }),
        );
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      await act(async () => {
        await ref.current.openAdd();
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.ok(modalProps, 'RowFormModal should receive props in add mode');
      assert.equal(modalProps.isAddMode, true);
      assert.ok(
        modalProps.disabledFields.includes('contractor_id'),
        'Primary key should remain disabled',
      );
      assert.ok(
        !modalProps.disabledFields.includes('contract_type_id'),
        'Relation dropdown should remain enabled in add mode',
      );
      assert.ok(
        pipelineConfigs.length > 0,
        'Generated column pipeline should be created for the table',
      );
      assert.ok(
        appliedGeneratedValues.length > 0,
        'Generated column pipeline should be applied to default rows',
      );
      assert.equal(
        calcFieldCalls.length,
        0,
        'Calc fields should not run when no calcFields config provided',
      );

      root.unmount();
    } finally {
      global.fetch = origFetch;
    }
  });
}
