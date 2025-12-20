import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

function createReactMock() {
  const stateStore = [];
  const stateSetters = [];
  const effectStore = [];
  const memoStore = [];
  const refStore = [];
  let componentRef = null;
  let propsRef = null;
  let tree = null;
  let stateIndex = 0;
  let effectIndex = 0;
  let memoIndex = 0;
  let refIndex = 0;
  let pendingEffects = [];

  function resetIndices() {
    stateIndex = 0;
    effectIndex = 0;
    memoIndex = 0;
    refIndex = 0;
  }

  function runEffects() {
    while (pendingEffects.length) {
      const index = pendingEffects.shift();
      const effect = effectStore[index];
      if (!effect) continue;
      if (typeof effect.cleanup === 'function') {
        try {
          effect.cleanup();
        } catch {}
      }
      const result = effect.fn();
      effect.cleanup = typeof result === 'function' ? result : undefined;
    }
  }

  const ReactMock = {
    Fragment: Symbol('Fragment'),
    createElement(type, props, ...children) {
      const flat = [];
      children.forEach((child) => {
        if (Array.isArray(child)) {
          child.forEach((c) => {
            if (c !== null && c !== undefined && c !== false) flat.push(c);
          });
        } else if (child !== null && child !== undefined && child !== false) {
          flat.push(child);
        }
      });
      if (typeof type === 'function') {
        return type({ ...(props || {}), children: flat });
      }
      if (type === ReactMock.Fragment) {
        return { type: 'fragment', props: props || {}, children: flat };
      }
      return { type, props: props || {}, children: flat };
    },
    useState(initial) {
      const index = stateIndex++;
      if (!(index in stateStore)) {
        stateStore[index] =
          typeof initial === 'function' ? initial() : initial;
        stateSetters[index] = (value) => {
          const next =
            typeof value === 'function' ? value(stateStore[index]) : value;
          if (!Object.is(next, stateStore[index])) {
            stateStore[index] = next;
            ReactMock.__render(componentRef, propsRef);
          }
        };
      }
      return [stateStore[index], stateSetters[index]];
    },
    useEffect(fn, deps) {
      const index = effectIndex++;
      const prev = effectStore[index];
      const depsArray = deps ?? null;
      const changed =
        !prev ||
        !depsArray ||
        !prev.deps ||
        depsArray.length !== prev.deps.length ||
        depsArray.some((d, i) => !Object.is(d, prev.deps[i]));
      effectStore[index] = {
        fn,
        deps: depsArray,
        cleanup: prev?.cleanup,
      };
      if (changed) pendingEffects.push(index);
    },
    useMemo(fn, deps) {
      const index = memoIndex++;
      const prev = memoStore[index];
      const depsArray = deps ?? null;
      const changed =
        !prev ||
        !depsArray ||
        !prev.deps ||
        depsArray.length !== prev.deps.length ||
        depsArray.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        memoStore[index] = { value: fn(), deps: depsArray };
      }
      return memoStore[index].value;
    },
    useCallback(fn, deps) {
      return ReactMock.useMemo(() => fn, deps);
    },
    useRef(initial) {
      const index = refIndex++;
      if (!(index in refStore)) {
        refStore[index] = { current: initial };
      }
      return refStore[index];
    },
    __render(Component, props) {
      componentRef = Component;
      propsRef = props;
      resetIndices();
      pendingEffects = [];
      tree = Component(props);
      runEffects();
      return tree;
    },
    __findByTestId(id, node = tree) {
      if (!node || typeof node !== 'object') return null;
      if (node.props?.['data-testid'] === id) return node;
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const found = ReactMock.__findByTestId(id, child);
          if (found) return found;
        }
      }
      return null;
    },
  };

  return {
    module: {
      default: ReactMock,
      Fragment: ReactMock.Fragment,
      createElement: ReactMock.createElement,
      useState: ReactMock.useState,
      useEffect: ReactMock.useEffect,
      useMemo: ReactMock.useMemo,
      useCallback: ReactMock.useCallback,
      useRef: ReactMock.useRef,
    },
    render: ReactMock.__render,
    findByTestId: ReactMock.__findByTestId,
  };
}

function findOptionValues(node) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children
    .filter((child) => child && child.type === 'option')
    .map((child) => child.props?.value)
    .filter((v) => v !== undefined);
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

if (typeof mock?.import !== 'function') {
  test('TableRelationsEditor loads relations for the active table', { skip: true }, () => {});
  test('TableRelationsEditor saves a custom relation mapping', { skip: true }, () => {});
  test('TableRelationsEditor removes a custom relation mapping', { skip: true }, () => {});
} else {
  test('TableRelationsEditor loads relations for the active table', async (t) => {
  const reactMock = createReactMock();
  const fetchCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const key = typeof url === 'string' ? url : url?.url;
    fetchCalls.push({ url: key, options });
    if (key === '/api/tables/users/columns') {
      return { ok: true, json: async () => ['id', 'dept_id', 'name'] };
    }
    if (key === '/api/tables') {
      return { ok: true, json: async () => ['users', 'departments'] };
    }
    if (key === '/api/tables/users/relations') {
      return {
        ok: true,
        json: async () => [
          {
            COLUMN_NAME: 'dept_id',
            REFERENCED_TABLE_NAME: 'departments',
            REFERENCED_COLUMN_NAME: 'id',
            source: 'database',
          },
          {
            COLUMN_NAME: 'dept_id',
            REFERENCED_TABLE_NAME: 'teams',
            REFERENCED_COLUMN_NAME: 'lead_id',
            source: 'custom',
            configIndex: 1,
          },
        ],
      };
    }
    if (key === '/api/tables/users/relations/custom') {
      return {
        ok: true,
        json: async () => ({
          relations: {
            dept_id: [
              { table: 'departments', column: 'id' },
              { table: 'teams', column: 'lead_id' },
            ],
          },
          isDefault: false,
        }),
      };
    }
    throw new Error(`unexpected fetch ${key}`);
  };
  const toasts = [];
  const { default: TableRelationsEditor } = await mock.import(
    '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
    {
      react: reactMock.module,
      'react-i18next': {
        useTranslation: () => ({ t: (_key, fallback) => fallback || _key }),
      },
      '../context/ToastContext.jsx': {
        useToast: () => ({ addToast: (msg, type) => toasts.push({ msg, type }) }),
      },
    },
  );

  reactMock.render(TableRelationsEditor, { table: 'users' });
  await flushPromises();
  await flushPromises();

  const requested = fetchCalls.map((c) => c.url).sort();
  assert.deepEqual(requested, [
    '/api/tables',
    '/api/tables/users/columns',
    '/api/tables/users/relations',
    '/api/tables/users/relations/custom',
  ]);
  const columnSelect = reactMock.findByTestId('relations-column-select');
  assert.ok(columnSelect);
  assert.ok(findOptionValues(columnSelect).includes('dept_id'));
  assert.ok(reactMock.findByTestId('relation-row-dept_id-database-0'));
  assert.ok(reactMock.findByTestId('relation-row-dept_id-custom-1'));
  global.fetch = originalFetch;
  });

  test('TableRelationsEditor saves a custom relation mapping', async (t) => {
  const reactMock = createReactMock();
  const originalFetch = global.fetch;
  const toasts = [];
  const calls = [];
  let saved = false;
  global.fetch = async (url, options = {}) => {
    const key = typeof url === 'string' ? url : url?.url;
    calls.push({ url: key, options });
    if (key === '/api/tables/users/columns') {
      return { ok: true, json: async () => ['id', 'dept_id'] };
    }
    if (key === '/api/tables') {
      return { ok: true, json: async () => ['departments', 'users'] };
    }
    if (key === '/api/tables/users/relations') {
      return {
        ok: true,
        json: async () =>
          saved
            ? [
                {
                  COLUMN_NAME: 'dept_id',
                  REFERENCED_TABLE_NAME: 'departments',
                  REFERENCED_COLUMN_NAME: 'id',
                  source: 'custom',
                  configIndex: 0,
                },
                {
                  COLUMN_NAME: 'dept_id',
                  REFERENCED_TABLE_NAME: 'teams',
                  REFERENCED_COLUMN_NAME: 'lead_id',
                  source: 'custom',
                  configIndex: 1,
                },
              ]
            : [
                {
                  COLUMN_NAME: 'dept_id',
                  REFERENCED_TABLE_NAME: 'departments',
                  REFERENCED_COLUMN_NAME: 'id',
                  source: 'custom',
                  configIndex: 0,
                },
              ],
      };
    }
    if (key === '/api/tables/users/relations/custom') {
      return {
        ok: true,
        json: async () =>
          saved
            ? {
                relations: {
                  dept_id: [
                    { table: 'departments', column: 'id' },
                    { table: 'teams', column: 'lead_id' },
                  ],
                },
                isDefault: false,
              }
            : {
                relations: { dept_id: [{ table: 'departments', column: 'id' }] },
                isDefault: false,
              },
      };
    }
    if (key === '/api/tables/departments/columns') {
      return { ok: true, json: async () => ['id', 'name'] };
    }
    if (key === '/api/tables/teams/columns') {
      return {
        ok: true,
        json: async () => [
          { name: 'lead_id' },
          { name: 'status', enumValues: ['active', 'inactive'] },
          { name: 'name' },
        ],
      };
    }
    if (key === '/api/tables/users/relations/custom/dept_id') {
      assert.equal(options.method, 'PUT');
      const body = JSON.parse(options.body);
      assert.deepEqual(body, {
        targetTable: 'teams',
        targetColumn: 'lead_id',
        combinationSourceColumn: 'dept_id',
        combinationTargetColumn: 'lead_id',
        filterColumn: 'status',
        filterValue: 'active',
      });
      saved = true;
      return {
        ok: true,
        json: async () => ({
          column: 'dept_id',
          relation: { table: 'teams', column: 'lead_id' },
          index: 1,
          relations: [
            { table: 'departments', column: 'id' },
            { table: 'teams', column: 'lead_id' },
          ],
        }),
      };
    }
    throw new Error(`unexpected fetch ${key}`);
  };

  const { default: TableRelationsEditor } = await mock.import(
    '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
    {
      react: reactMock.module,
      'react-i18next': {
        useTranslation: () => ({ t: (_key, fallback) => fallback || _key }),
      },
      '../context/ToastContext.jsx': {
        useToast: () => ({ addToast: (msg, type) => toasts.push({ msg, type }) }),
      },
    },
  );

  reactMock.render(TableRelationsEditor, { table: 'users' });
  await flushPromises();
  await flushPromises();

  let columnSelect = reactMock.findByTestId('relations-column-select');
  columnSelect.props.onChange({ target: { value: 'dept_id' } });
  await flushPromises();

  let tableSelect = reactMock.findByTestId('relations-target-table');
  await tableSelect.props.onChange({ target: { value: 'teams' } });
  await flushPromises();
  await flushPromises();

  let targetSelect = reactMock.findByTestId('relations-target-column');
  targetSelect.props.onChange({ target: { value: 'lead_id' } });

  let comboSource = reactMock.findByTestId('relations-combo-source');
  comboSource.props.onChange({ target: { value: 'dept_id' } });
  await flushPromises();

  let comboTarget = reactMock.findByTestId('relations-combo-target');
  comboTarget.props.onChange({ target: { value: 'lead_id' } });

  const filterColumnSelect = reactMock.findByTestId('relations-target-filter-column');
  filterColumnSelect.props.onChange({ target: { value: 'status' } });
  await flushPromises();

  const filterValueSelect = reactMock.findByTestId('relations-target-filter-enum');
  filterValueSelect.props.onChange({ target: { value: 'active' } });

  const saveBtn = reactMock.findByTestId('relations-save');
  await saveBtn.props.onClick();
  await flushPromises();
  await flushPromises();

  assert.ok(saved);
  assert.ok(
    calls.some(
      (c) =>
        c.url === '/api/tables/users/relations/custom/dept_id' &&
        c.options.method === 'PUT',
    ),
  );
  assert.ok(reactMock.findByTestId('relation-row-dept_id-custom-1'));
  assert.ok(toasts.some((t) => t.type === 'success'));
  global.fetch = originalFetch;
  });

  test('TableRelationsEditor removes a custom relation mapping', async (t) => {
  const reactMock = createReactMock();
  const originalFetch = global.fetch;
  const toasts = [];
  let removed = false;
  global.fetch = async (url, options = {}) => {
    const key = typeof url === 'string' ? url : url?.url;
    if (key === '/api/tables/users/columns') {
      return { ok: true, json: async () => ['id', 'dept_id'] };
    }
    if (key === '/api/tables') {
      return { ok: true, json: async () => ['departments'] };
    }
    if (key === '/api/tables/users/relations') {
      return {
        ok: true,
        json: async () =>
          removed
            ? []
            : [
                {
                  COLUMN_NAME: 'dept_id',
                  REFERENCED_TABLE_NAME: 'departments',
                  REFERENCED_COLUMN_NAME: 'id',
                  source: 'custom',
                  configIndex: 0,
                },
                {
                  COLUMN_NAME: 'dept_id',
                  REFERENCED_TABLE_NAME: 'teams',
                  REFERENCED_COLUMN_NAME: 'lead_id',
                  source: 'custom',
                  configIndex: 1,
                },
              ],
      };
    }
    if (key === '/api/tables/users/relations/custom') {
      return {
        ok: true,
        json: async () =>
          removed
            ? { relations: {}, isDefault: false }
            : {
                relations: {
                  dept_id: [
                    { table: 'departments', column: 'id' },
                    { table: 'teams', column: 'lead_id' },
                  ],
                },
                isDefault: false,
              },
      };
    }
    if (
      key === '/api/tables/users/relations/custom/dept_id?index=0' &&
      options.method === 'DELETE'
    ) {
      removed = true;
      return {
        ok: true,
        json: async () => ({
          column: 'dept_id',
          removed: { table: 'departments', column: 'id' },
          index: 0,
          relations: [{ table: 'teams', column: 'lead_id' }],
        }),
      };
    }
    throw new Error(`unexpected fetch ${key}`);
  };

  const { default: TableRelationsEditor } = await mock.import(
    '../../src/erp.mgt.mn/components/TableRelationsEditor.jsx',
    {
      react: reactMock.module,
      'react-i18next': {
        useTranslation: () => ({ t: (_key, fallback) => fallback || _key }),
      },
      '../context/ToastContext.jsx': {
        useToast: () => ({ addToast: (msg, type) => toasts.push({ msg, type }) }),
      },
    },
  );

  reactMock.render(TableRelationsEditor, { table: 'users' });
  await flushPromises();
  await flushPromises();

  const deleteBtn = reactMock.findByTestId('relation-delete-dept_id-custom-0');
  assert.ok(deleteBtn);
  await deleteBtn.props.onClick();
  await flushPromises();
  await flushPromises();

  assert.ok(removed);
  assert.ok(toasts.some((t) => t.type === 'success'));
  global.fetch = originalFetch;
  });
}
