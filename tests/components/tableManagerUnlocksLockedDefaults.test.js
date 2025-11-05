import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDisabledFieldState,
  filterDisabledFieldsForIdFields,
} from '../../src/erp.mgt.mn/components/tableManagerDisabledFields.js';

let React;
let act;
let createRoot;
let haveReact = true;
let JSDOM;

try {
  ({ JSDOM } = await import('jsdom'));
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
} catch {
  haveReact = false;
}

if (!haveReact) {
  test('filterDisabledFieldsForIdFields removes idField aliases from disabled list', () => {
    const filtered = filterDisabledFieldsForIdFields({
      disabledFields: ['GuardCode', 'OtherField'],
      relationConfigs: {
        GuardSelect: { idField: 'GuardCode', column: 'GuardSelect' },
        GuardCode: { idField: 'GuardCode', column: 'GuardSelect' },
      },
      resolveCanonicalKey: (value) => value,
      validColumns: new Set(['GuardSelect', 'GuardCode']),
    });

    assert.deepEqual(filtered, ['OtherField']);
  });

  test('TableManager unlocks locked defaults for new transactions', () => {
    const baseArgs = {
      editSet: null,
      formColumns: ['GuardSelect', 'OtherField'],
      requestType: null,
      isAdding: true,
      editing: null,
      lockedDefaults: ['GuardSelect'],
      canonicalizeFormFields: (fields) => fields,
      buttonPerms: { 'New transaction': true },
      getKeyFields: () => [],
    };

    const { disabledFields, bypassGuardDefaults } =
      resolveDisabledFieldState(baseArgs);
    assert.equal(bypassGuardDefaults, true);
    assert.ok(
      !disabledFields.includes('GuardSelect'),
      'GuardSelect should be editable when guard bypass is active',
    );

    const { disabledFields: withoutPerm } = resolveDisabledFieldState({
      ...baseArgs,
      buttonPerms: { 'New transaction': false },
    });
    assert.ok(
      withoutPerm.includes('GuardSelect'),
      'GuardSelect should remain disabled without permission',
    );

    const restrictedArgs = {
      ...baseArgs,
      editSet: new Set(['otherfield']),
    };

    const { disabledFields: restrictedBypass } = resolveDisabledFieldState(
      restrictedArgs,
    );
    assert.deepEqual(
      restrictedBypass,
      [],
      'Bypassing guards should clear edit-set restrictions as well',
    );

    const { disabledFields: restrictedNoPerm } = resolveDisabledFieldState({
      ...restrictedArgs,
      buttonPerms: { 'New transaction': false },
    });
    assert.ok(
      restrictedNoPerm.includes('GuardSelect'),
      'Edit-set restrictions should apply without permission',
    );
  });
} else {
  test('filterDisabledFieldsForIdFields removes idField aliases from disabled list', () => {
    const filtered = filterDisabledFieldsForIdFields({
      disabledFields: ['GuardCode', 'OtherField'],
      relationConfigs: {
        GuardSelect: { idField: 'GuardCode', column: 'GuardSelect' },
        GuardCode: { idField: 'GuardCode', column: 'GuardSelect' },
      },
      resolveCanonicalKey: (value) => value,
      validColumns: new Set(['GuardSelect', 'OtherField', 'GuardCode']),
    });

    assert.deepEqual(filtered, ['OtherField']);
  });

  test('TableManager unlocks locked defaults for new transactions', async (t) => {
    if (typeof t.mock?.import !== 'function') {
      t.skip('mock.import not supported in this runtime');
      return;
    }

    const prevWindow = global.window;
    const prevDocument = global.document;
    const prevNavigator = global.navigator;
    const prevFetch = global.fetch;

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    dom.window.scrollTo = () => {};
    dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));

    global.fetch = async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === '/api/tables/test/columns') {
        return {
          ok: true,
          json: async () => [
            { name: 'id', key: 'PRI' },
            { name: 'GuardSelect' },
            { name: 'OtherField' },
            { name: 'GuardCode' },
          ],
        };
      }
      if (url === '/api/tables/test/relations') {
        return {
          ok: true,
          json: async () => [
            {
              COLUMN_NAME: 'GuardSelect',
              REFERENCED_TABLE_NAME: 'guards',
              REFERENCED_COLUMN_NAME: 'id',
            },
          ],
        };
      }
      if (url === '/api/tables/test/relations/custom') {
        return { ok: true, json: async () => ({ relations: {} }) };
      }
      if (url.startsWith('/api/display_fields')) {
        if (url.includes('table=guards')) {
          return {
            ok: true,
            json: async () => ({ idField: 'GuardCode', displayFields: ['GuardName'] }),
          };
        }
        return { ok: true, json: async () => ({}) };
      }
      if (url.startsWith('/api/proc_triggers')) {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/tables/test?')) {
        return { ok: true, json: async () => ({ rows: [], count: 0 }) };
      }
      if (url === '/api/tenant_tables/guards') {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/guards/relations')) {
        return { ok: true, json: async () => [] };
      }
      if (url.startsWith('/api/tables/guards?')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              { id: 'G-1', GuardCode: 'CODE-1', GuardName: 'Alpha' },
              { id: 'G-2', GuardCode: 'CODE-2', GuardName: 'Beta' },
            ],
            count: 2,
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const modalProps = [];

    const RowFormModalStub = (props) => {
      modalProps.push({ ...props });
      return null;
    };

    const { default: TableManager } = await t.mock.import(
      '../../src/erp.mgt.mn/components/TableManager.jsx',
      {
        '../context/AuthContext.jsx': {
          AuthContext: React.createContext({
            user: { empid: 'EMP-1' },
            company: 1,
            branch: 1,
            department: 1,
            session: {},
          }),
        },
        '../context/ToastContext.jsx': {
          useToast: () => ({
            addToast: () => {},
          }),
        },
        './RowFormModal.jsx': { default: RowFormModalStub },
        './CascadeDeleteModal.jsx': { default: () => null },
        './RowDetailModal.jsx': { default: () => null },
        './RowImageViewModal.jsx': { default: () => null },
        './RowImageUploadModal.jsx': { default: () => null },
        './ImageSearchModal.jsx': { default: () => null },
        './Modal.jsx': { default: () => null },
        './CustomDatePicker.jsx': { default: () => null },
        './TooltipWrapper.jsx': {
          default: ({ children }) => React.createElement(React.Fragment, null, children),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({}) },
        '../utils/formatTimestamp.js': { default: () => '2024-01-01 00:00:00' },
        '../utils/buildImageName.js': { default: () => ({}) },
        '../utils/slugify.js': { default: () => '' },
        '../utils/apiBase.js': { API_BASE: '' },
        '../utils/normalizeDateInput.js': { default: (v) => v },
      },
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    const formConfig = {
      visibleFields: ['id', 'GuardCode', 'GuardSelect'],
      mainFields: ['GuardCode', 'GuardSelect'],
      defaultValues: { GuardSelect: 'LOCKED' },
      editableFields: ['OtherField', 'GuardCode'],
      supportsTemporarySubmission: true,
      allowedBranches: ['999'],
      allowedDepartments: ['999'],
      temporaryAllowedBranches: ['1'],
      temporaryAllowedDepartments: ['1'],
    };

    try {
      await act(async () => {
        root.render(
          React.createElement(TableManager, {
            table: 'test',
            buttonPerms: { 'New transaction': true },
            formConfig,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const addButton = container.querySelector('button');
      assert.ok(addButton, 'expected add button to be rendered');

      await act(async () => {
        addButton.dispatchEvent(
          new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const latestProps = modalProps[modalProps.length - 1];
      assert.ok(latestProps, 'expected RowFormModal to receive props');
      assert.equal(latestProps.forceEditable, true, 'expected guard overrides to be enabled');
      assert.equal(
        latestProps.canPost,
        false,
        'canPost should be false for temporary-only access scenarios',
      );
      assert.equal(
        latestProps.allowTemporarySave,
        true,
        'temporary-only forms should still allow temporary saves',
      );
      assert.ok(
        !latestProps.disabledFields.includes('GuardSelect'),
        'GuardSelect should not be disabled when guard overrides are active',
      );
      assert.equal(
        latestProps.disabledFields.length,
        0,
        'No form fields should be disabled when guard overrides are active',
      );
      assert.ok(
        latestProps.relationConfigs.GuardCode,
        'Expected id-field alias to be included in relation configs',
      );
      assert.equal(
        latestProps.relationConfigs.GuardCode.table,
        'guards',
        'GuardCode alias should retain relation table metadata',
      );
      assert.ok(
        latestProps.relationData.GuardCode?.CODE-1,
        'GuardCode relation data should include rows keyed by the id field value',
      );
      assert.deepEqual(
        latestProps.relations.GuardCode?.map((opt) => opt.value),
        ['CODE-1', 'CODE-2'],
        'GuardCode dropdown options should be keyed by the id field values',
      );
    } finally {
      root.unmount();
      container.remove();
      global.window = prevWindow;
      global.document = prevDocument;
      global.navigator = prevNavigator;
      if (prevFetch) {
        global.fetch = prevFetch;
      } else {
        delete global.fetch;
      }
    }
  });
}
