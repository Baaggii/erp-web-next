import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let React;
let render;
let screen;
let cleanup;
let fireEvent;
let waitFor;
let userEvent;
let JSDOM;
let haveRTL = true;

try {
  ({ JSDOM } = await import('jsdom'));
  const reactModule = await import('react');
  React = reactModule.default || reactModule;
  const rtl = await import('@testing-library/react');
  render = rtl.render;
  screen = rtl.screen;
  cleanup = rtl.cleanup;
  fireEvent = rtl.fireEvent;
  waitFor = rtl.waitFor;
  ({ default: userEvent } = await import('@testing-library/user-event'));
} catch {
  haveRTL = false;
}

if (!haveRTL) {
  test('FinanceTransactions focuses the first parameter control after selecting a report', { skip: true }, () => {});
  test('FinanceTransactions advances focus with Enter and runs the report from the last control', { skip: true }, () => {});
  test(
    'FinanceTransactions updates available procedures immediately when switching forms sharing a table',
    { skip: true },
    () => {},
  );
} else {
  function setupDom() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      pretendToBeVisual: true,
      url: 'http://localhost/',
    });
    const prev = {
      window: global.window,
      document: global.document,
      navigator: global.navigator,
      HTMLElement: global.HTMLElement,
      Event: global.Event,
      KeyboardEvent: global.KeyboardEvent,
      MouseEvent: global.MouseEvent,
      PointerEvent: global.PointerEvent,
      CustomEvent: global.CustomEvent,
      getComputedStyle: global.getComputedStyle,
      requestAnimationFrame: global.requestAnimationFrame,
      cancelAnimationFrame: global.cancelAnimationFrame,
    };
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.Event = dom.window.Event;
    global.KeyboardEvent = dom.window.KeyboardEvent;
    global.MouseEvent = dom.window.MouseEvent;
    global.PointerEvent = dom.window.PointerEvent || dom.window.MouseEvent;
    global.CustomEvent = dom.window.CustomEvent;
    global.getComputedStyle = dom.window.getComputedStyle;
    global.requestAnimationFrame =
      dom.window.requestAnimationFrame?.bind(dom.window) || ((cb) => setTimeout(cb, 0));
    global.cancelAnimationFrame =
      dom.window.cancelAnimationFrame?.bind(dom.window) || ((id) => clearTimeout(id));
    global.IS_REACT_ACT_ENVIRONMENT = true;
    return { dom, prev };
  }

  function restoreDom(dom, prev) {
    dom.window.close();
    global.window = prev.window;
    global.document = prev.document;
    global.navigator = prev.navigator;
    global.HTMLElement = prev.HTMLElement;
    global.Event = prev.Event;
    global.KeyboardEvent = prev.KeyboardEvent;
    global.MouseEvent = prev.MouseEvent;
    global.PointerEvent = prev.PointerEvent;
    global.CustomEvent = prev.CustomEvent;
    global.getComputedStyle = prev.getComputedStyle;
    global.requestAnimationFrame = prev.requestAnimationFrame;
    global.cancelAnimationFrame = prev.cancelAnimationFrame;
  }

  async function renderFinanceTransactions(fetchStub, addToastStub) {
    const { dom, prev } = setupDom();
    const prevFetch = global.fetch;
    global.fetch = fetchStub;

    const authContextValue = {
      company: 1,
      branch: 'BR-1',
      department: 'DEP-1',
      user: { empid: 'EMP-1' },
      permissions: { finance_transactions: true },
    };

    const AuthContext = React.createContext(authContextValue);
    const searchParamsStore = { current: new URLSearchParams() };
    const sessionStore = { current: {} };

    function useSearchParamsMock() {
      const [params, setParams] = React.useState(searchParamsStore.current);
      const setSearchParams = (update) => {
        setParams((prevParams) => {
          let next = update;
          if (typeof update === 'function') {
            next = update(prevParams);
          }
          if (next instanceof URLSearchParams) return next;
          if (!next) return new URLSearchParams();
          if (typeof next === 'string') return new URLSearchParams(next);
          return new URLSearchParams(next);
        });
      };
      return [params, setSearchParams];
    }

    function useTxnSessionMock() {
      const [state, setState] = React.useState(sessionStore.current);
      const setWrapped = (value) => {
        setState((prevState) => {
          const nextState =
            typeof value === 'function' ? value(prevState) : value;
          sessionStore.current = nextState;
          return nextState;
        });
      };
      return [state, setWrapped];
    }

    const { default: FinanceTransactions } = await mock.import(
      '../../src/erp.mgt.mn/pages/FinanceTransactions.jsx',
      {
        '../context/AuthContext.jsx': { AuthContext },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: addToastStub }),
        },
        '../context/TxnSessionContext.jsx': {
          useTxnSession: useTxnSessionMock,
        },
        '../hooks/useCompanyModules.js': {
          useCompanyModules: () => ({ finance_transactions: true }),
        },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/TableManager.jsx': { default: () => null },
        '../components/ReportTable.jsx': { default: () => null },
        'react-router-dom': { useSearchParams: useSearchParamsMock },
      },
    );

    function Wrapper(props) {
      return React.createElement(
        AuthContext.Provider,
        { value: authContextValue },
        React.createElement(FinanceTransactions, props),
      );
    }

    const user = userEvent.setup();
    const utils = render(
      React.createElement(Wrapper, { moduleLabel: 'Finance' }),
    );

    async function cleanupAll() {
      await cleanup();
      mock.restoreAll();
      restoreDom(dom, prev);
      global.fetch = prevFetch;
    }

    return { ...utils, user, cleanupAll };
  }

  function createFetchStub() {
    const calls = [];
    const fetchStub = mock.fn(async (url, options = {}) => {
      calls.push({ url, options });
      if (url.startsWith('/api/transaction_forms?moduleKey=finance_transactions')) {
        return {
          ok: true,
          json: async () => ({
            FinanceReport: {
              moduleKey: 'finance_transactions',
              table: 'finance_table',
              procedures: ['report_proc'],
              allowedBranches: [],
              allowedDepartments: [],
            },
          }),
        };
      }
      if (url.startsWith('/api/transaction_forms?table=finance_table&name=FinanceReport')) {
        return {
          ok: true,
          json: async () => ({
            moduleKey: 'finance_transactions',
            table: 'finance_table',
            procedures: ['report_proc'],
          }),
        };
      }
      if (url.startsWith('/api/procedures/report_proc/params')) {
        return {
          ok: true,
          json: async () => ({
            parameters: ['StartDate', 'EndDate', { name: 'ManualParam' }],
          }),
        };
      }
      if (url === '/api/procedures') {
        return {
          ok: true,
          json: async () => ({ row: [] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
    return { fetchStub, calls };
  }

  async function selectReport(user) {
    const [transactionSelect] = screen.getAllByRole('combobox');
    await waitFor(() => {
      assert.ok(transactionSelect.options.length > 1);
    });
    await user.selectOptions(transactionSelect, 'FinanceReport');

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      assert.equal(selects.length, 2);
    });

    const [, procedureSelect] = screen.getAllByRole('combobox');
    await user.selectOptions(procedureSelect, 'report_proc');

    await waitFor(() => {
      assert.ok(screen.getByRole('button', { name: 'Run' }));
    });
  }

  test(
    'FinanceTransactions focuses the first parameter control after selecting a report',
    async () => {
      const addToastStub = mock.fn();
      const { fetchStub, calls } = createFetchStub();
      const { cleanupAll, user } = await renderFinanceTransactions(fetchStub, addToastStub);

      try {
        await selectReport(user);

        const presetSelect = await screen.findByDisplayValue('custom');

        await waitFor(() => {
          assert.equal(document.activeElement, presetSelect);
        });

        assert.ok(calls.some((call) => call.url.startsWith('/api/procedures/report_proc/params')));
      } finally {
        await cleanupAll();
      }
    },
  );

  test(
    'FinanceTransactions advances focus with Enter and runs the report from the last control',
    async () => {
      const addToastStub = mock.fn();
      const { fetchStub, calls } = createFetchStub();
      const { cleanupAll, user, container } = await renderFinanceTransactions(
        fetchStub,
        addToastStub,
      );

      try {
        await selectReport(user);

        const dateInputs = () => container.querySelectorAll('input[type="date"]');

        await waitFor(() => {
          assert.equal(dateInputs().length, 2);
        });

        const manualInput = screen.getByPlaceholderText('ManualParam');
        const runButton = screen.getByRole('button', { name: 'Run' });

        await user.keyboard('{Enter}');
        await waitFor(() => {
          assert.equal(document.activeElement, dateInputs()[0]);
        });

        fireEvent.change(document.activeElement, { target: { value: '2024-01-01' } });

        await user.keyboard('{Enter}');
        await waitFor(() => {
          assert.equal(document.activeElement, dateInputs()[1]);
        });

        fireEvent.change(document.activeElement, { target: { value: '2024-01-31' } });

        await user.keyboard('{Enter}');
        await waitFor(() => {
          assert.equal(document.activeElement, manualInput);
        });

        await user.type(manualInput, 'ready');

        await user.keyboard('{Enter}');
        await waitFor(() => {
          assert.equal(document.activeElement, runButton);
        });

        await user.keyboard('{Enter}');

        await waitFor(() => {
          const runCalls = calls.filter((call) => call.url === '/api/procedures');
          assert.equal(runCalls.length, 1);
          assert.equal(runCalls[0].options?.method, 'POST');
        });
      } finally {
        await cleanupAll();
      }
    },
  );

  test(
    'FinanceTransactions updates available procedures immediately when switching forms sharing a table',
    async () => {
      const addToastStub = mock.fn();
      let resolveFormBConfig;
      const fetchStub = mock.fn(async (url) => {
        if (url.startsWith('/api/transaction_forms?moduleKey=finance_transactions')) {
          return {
            ok: true,
            json: async () => ({
              FormA: {
                moduleKey: 'finance_transactions',
                table: 'shared_table',
                procedures: ['proc_a'],
              },
              FormB: {
                moduleKey: 'finance_transactions',
                table: 'shared_table',
                procedures: ['proc_b'],
              },
            }),
          };
        }
        if (url.startsWith('/api/transaction_forms?table=shared_table&name=FormA')) {
          return {
            ok: true,
            json: async () => ({
              moduleKey: 'finance_transactions',
              table: 'shared_table',
              procedures: ['proc_a'],
            }),
          };
        }
        if (url.startsWith('/api/transaction_forms?table=shared_table&name=FormB')) {
          return {
            ok: true,
            json: () =>
              new Promise((resolve) => {
                resolveFormBConfig = () =>
                  resolve({
                    moduleKey: 'finance_transactions',
                    table: 'shared_table',
                    procedures: ['proc_b'],
                  });
              }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const { cleanupAll, user } = await renderFinanceTransactions(fetchStub, addToastStub);

      try {
        const transactionSelect = await screen.findByRole('combobox');

        await waitFor(() => {
          const optionValues = Array.from(transactionSelect.options).map((opt) => opt.value);
          assert.ok(optionValues.includes('FormA'));
          assert.ok(optionValues.includes('FormB'));
        });

        await user.selectOptions(transactionSelect, 'FormA');

        await waitFor(() => {
          const selects = screen.getAllByRole('combobox');
          assert.equal(selects.length, 2);
          const optionValues = Array.from(selects[1].options).map((opt) => opt.value);
          assert.deepEqual(optionValues, ['', 'proc_a']);
        });

        await user.selectOptions(transactionSelect, 'FormB');

        await waitFor(() => {
          const selects = screen.getAllByRole('combobox');
          assert.equal(selects.length, 2);
          const [, procedureSelect] = selects;
          const optionValues = Array.from(procedureSelect.options).map((opt) => opt.value);
          assert.deepEqual(optionValues, ['', 'proc_b']);
          assert.equal(procedureSelect.value, '');
        });

        assert.equal(typeof resolveFormBConfig, 'function');
        resolveFormBConfig();

        await waitFor(() => {
          const selects = screen.getAllByRole('combobox');
          const [, procedureSelect] = selects;
          const optionValues = Array.from(procedureSelect.options).map((opt) => opt.value);
          assert.deepEqual(optionValues, ['', 'proc_b']);
        });
      } finally {
        await cleanupAll();
      }
    },
  );
}

