import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('Reports shows date controls when parameters include dates', { skip: true }, () => {});
  test('Reports hides date controls when parameters omit dates', { skip: true }, () => {});
} else {
  function createReactStub(states, setters, indexRef, contextValue) {
    const reactMock = {
      Fragment: Symbol.for('react.fragment'),
      useState(initial) {
        const idx = indexRef.current;
        if (states.length <= idx) {
          states[idx] = initial;
        }
        const setter = (value) => {
          states[idx] = typeof value === 'function' ? value(states[idx]) : value;
        };
        setters[idx] = setter;
        indexRef.current += 1;
        return [states[idx], setter];
      },
      useRef(initial) {
        const idx = indexRef.current;
        if (states.length <= idx) {
          states[idx] = { current: initial };
        }
        indexRef.current += 1;
        return states[idx];
      },
      useEffect(fn) {
        fn();
      },
      useMemo(fn) {
        return fn();
      },
      useContext() {
        return contextValue;
      },
      createElement(type, props, ...children) {
        if (type === reactMock.Fragment) {
          return children;
        }
        if (typeof type === 'function') {
          return type({ ...(props || {}), children });
        }
        return { type, props: { ...(props || {}), children } };
      },
    };

    return reactMock;
  }

  function collectNodes(node, predicate, results = []) {
    if (!node) return results;
    if (Array.isArray(node)) {
      node.forEach((child) => collectNodes(child, predicate, results));
      return results;
    }
    if (typeof node !== 'object') return results;
    if (predicate(node)) {
      results.push(node);
    }
    const children = node.props?.children;
    if (children) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach((child) => collectNodes(child, predicate, results));
    }
    return results;
  }

  function hasOptionWithValue(node, value) {
    return (
      collectNodes(node, (child) => child.type === 'option' && child.props?.value === value)
        .length > 0
    );
  }

  test('Reports shows date controls when parameters include dates', async () => {
    global.fetch = async (url) => {
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_with_dates' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_with_dates/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: ['StartDate', 'EndDate'] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = { company: 1, branch: 2, department: 3, user: { empid: 4 } };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { workplaceFetchToastEnabled: true } }),
        },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_with_dates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const selects = collectNodes(tree, (node) => node.type === 'select');
    assert.equal(selects.length, 2, 'Expected both procedure and preset selects');

    const presetSelect = selects.find(
      (node) => !hasOptionWithValue(node, '') && hasOptionWithValue(node, 'custom'),
    );
    assert.ok(presetSelect, 'Preset select not rendered');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 2, 'Expected two date pickers to render');

    const manualDateInputs = collectNodes(
      tree,
      (node) => node.type === 'input' && /StartDate|EndDate/.test(node.props?.placeholder || ''),
    );
    assert.equal(manualDateInputs.length, 0, 'Manual date inputs should be hidden');

    delete global.fetch;
  });

  test('Reports hides date controls when parameters omit dates', async () => {
    global.fetch = async (url) => {
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_without_dates' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_without_dates/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: ['BranchId'] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = { company: 1, branch: 'B-1', department: null, user: { empid: null } };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { workplaceFetchToastEnabled: true } }),
        },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_without_dates' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const selects = collectNodes(tree, (node) => node.type === 'select');
    assert.equal(selects.length, 1, 'Preset select should be hidden when no date params');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 0, 'Date pickers should not render without date params');

    delete global.fetch;
  });

  test('Reports keeps year/month parameters manual and posts raw values', async () => {
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_with_period_parts' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_with_period_parts/params')) {
        return {
          ok: true,
          json: async () => ({
            parameters: ['start_year', 'start_month', 'end_year', 'end_month'],
          }),
        };
      }
      if (url.startsWith('/api/procedures') && options.method === 'POST') {
        return { ok: true, json: async () => ({ row: [], fieldTypeMap: {} }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = { company: 99, branch: 'B-77', department: 'D-8', user: { empid: 123 } };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_with_period_parts' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const presetSelects = collectNodes(tree, (node) =>
      node.type === 'select' && hasOptionWithValue(node, 'custom'),
    );
    assert.equal(presetSelects.length, 0, 'Preset select should not show for manual periods');

    const datePickers = collectNodes(tree, (node) => node.type === 'CustomDatePicker');
    assert.equal(datePickers.length, 0, 'Date pickers should not render for manual periods');

    const expectInputs = [
      ['start_year', '2023'],
      ['start_month', '01'],
      ['end_year', '2024'],
      ['end_month', '02'],
    ];

    for (const [placeholder, value] of expectInputs) {
      const inputNode = collectNodes(
        tree,
        (node) => node.type === 'input' && node.props?.placeholder === placeholder,
      )[0];
      assert.ok(inputNode, `Input for ${placeholder} not rendered`);
      inputNode.props.onChange({ target: { value } });
      tree = render();
    }

    const runButton = collectNodes(tree, (node) => node.type === 'button')[0];
    assert.ok(runButton, 'Run button missing');
    assert.equal(runButton.props.disabled, false, 'Run button should be enabled once filled');

    await runButton.props.onClick();

    const postCall = fetchCalls.find(
      ({ url, options }) => url.startsWith('/api/procedures') && options.method === 'POST',
    );
    assert.ok(postCall, 'Procedure POST call not captured');
    const parsedBody = JSON.parse(postCall.options.body);
    assert.deepEqual(
      parsedBody.params,
      ['2023', '01', '2024', '02'],
      'Manual period parameters should post raw strings',
    );

    delete global.fetch;
  });

  test('Reports surfaces detailed procedure errors', async () => {
    const fetchCalls = [];
    const errorMessage = "Request failed: Invalid default value for 'created_at'";
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({ procedures: [{ name: 'report_error' }] }),
        };
      }
      if (url.startsWith('/api/procedures/report_error/params')) {
        return {
          ok: true,
          json: async () => ({ parameters: [] }),
        };
      }
      if (url.startsWith('/api/procedures') && options.method === 'POST') {
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => JSON.stringify({ message: errorMessage }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    const addToastCalls = [];
    const addToast = (message, type) => {
      addToastCalls.push({ message, type });
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = { company: 99, branch: 'B-77', department: 'D-8', user: { empid: 123 } };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { workplaceFetchToastEnabled: true } }),
        },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': { default: (props) => ({ type: 'CustomDatePicker', props }) },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_error' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const runButton = collectNodes(tree, (node) => node.type === 'button')[0];
    assert.ok(runButton, 'Run button missing');

    await runButton.props.onClick();

    const errorToast = addToastCalls.find((call) => call.type === 'error');
    assert.ok(errorToast, 'Error toast not emitted');
    assert.equal(
      errorToast.message,
      `Failed to run report_error: ${errorMessage}`,
      'Error toast should include procedure name and backend message',
    );

    const infoToast = addToastCalls.find((call) => call.type === 'info');
    assert.ok(infoToast, 'Info toast missing');

    const postCall = fetchCalls.find(
      ({ url, options }) => url.startsWith('/api/procedures') && options.method === 'POST',
    );
    assert.ok(postCall, 'Procedure POST call not captured');

    delete global.fetch;
  });

  test('Reports fetches workplaces for year/month and emits diagnostics when toggled', async () => {
    const fetchCalls = [];
    global.fetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url.startsWith('/api/report_procedures')) {
        return {
          ok: true,
          json: async () => ({
            procedures: [{ name: 'report_with_workplace_period' }],
          }),
        };
      }
      if (url.startsWith('/api/procedures/report_with_workplace_period/params')) {
        return {
          ok: true,
          json: async () => ({
            parameters: ['workplace_id', 'period_year', 'period_month'],
          }),
        };
      }
      if (url.startsWith('/api/reports/workplaces')) {
        return {
          ok: true,
          json: async () => ({
            assignments: [
              {
                workplace_id: '2',
                workplace_session_id: '22',
                workplace_name: 'Period workplace',
                company_id: 99,
                branch_id: 77,
                department_id: 8,
              },
            ],
            diagnostics: {
              formattedSql: 'SELECT * FROM tbl_employment_schedule WHERE emp_id = ? AND company_id = ?;',
            },
          }),
        };
      }
      if (url.startsWith('/api/procedures') && options.method === 'POST') {
        return { ok: true, json: async () => ({ row: [], fieldTypeMap: {} }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const addToastCalls = [];
    const addToast = (message, type) => {
      addToastCalls.push({ message, type });
    };

    const states = [];
    const setters = [];
    const indexRef = { current: 0 };
    const contextValue = {
      company: 99,
      branch: 77,
      department: 8,
      workplace: 11,
      user: { empid: 321 },
      session: {
        company_id: 99,
        branch_id: 77,
        department_id: 8,
        workplace_id: 1,
        workplace_session_id: 11,
        workplace_name: 'Base workplace',
        workplace_assignments: [
          {
            workplace_id: 1,
            workplace_session_id: 11,
            workplace_name: 'Base workplace',
          },
        ],
      },
    };
    const reactMock = createReactStub(states, setters, indexRef, contextValue);

    const { default: ReportsPage } = await mock.import(
      '../../src/erp.mgt.mn/pages/Reports.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useRef: reactMock.useRef,
          useEffect: reactMock.useEffect,
          useMemo: reactMock.useMemo,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
          Fragment: reactMock.Fragment,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast }) },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { workplaceFetchToastEnabled: true } }),
        },
        '../hooks/useHeaderMappings.js': { default: () => ({}) },
        '../hooks/useButtonPerms.js': { default: () => ({}) },
        '../components/CustomDatePicker.jsx': {
          default: (props) => ({ type: 'CustomDatePicker', props }),
        },
        '../components/ReportTable.jsx': { default: () => null },
        '../utils/formatTimestamp.js': { default: (date) => date.toISOString() },
        '../utils/normalizeDateInput.js': { default: (value) => value },
      },
    );

    function render() {
      indexRef.current = 0;
      return ReportsPage();
    }

    render();
    await Promise.resolve();
    await Promise.resolve();
    let tree = render();

    const procedureSelect = collectNodes(
      tree,
      (node) => node.type === 'select' && hasOptionWithValue(node, ''),
    )[0];
    assert.ok(procedureSelect, 'Procedure select not found');

    procedureSelect.props.onChange({ target: { value: 'report_with_workplace_period' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const yearInput = collectNodes(
      tree,
      (node) => node.type === 'input' && node.props?.placeholder === 'period_year',
    )[0];
    assert.ok(yearInput, 'Year input missing');
    yearInput.props.onChange({ target: { value: '2025' } });

    tree = render();

    const monthInput = collectNodes(
      tree,
      (node) => node.type === 'input' && node.props?.placeholder === 'period_month',
    )[0];
    assert.ok(monthInput, 'Month input missing');
    monthInput.props.onChange({ target: { value: '10' } });

    tree = render();
    await Promise.resolve();
    await Promise.resolve();
    tree = render();

    const workplaceOption = collectNodes(
      tree,
      (node) => node.type === 'option' && node.props?.value === '22',
    )[0];
    assert.ok(workplaceOption, 'Fetched workplace option not populated');

    const workplaceCall = fetchCalls.find(({ url }) =>
      url.startsWith('/api/reports/workplaces?'),
    );
    assert.ok(workplaceCall, 'Workplace fetch call not executed');
    assert.ok(
      /year=2025/.test(workplaceCall.url),
      'Year parameter missing from workplace fetch',
    );
    assert.ok(
      /month=10/.test(workplaceCall.url),
      'Month parameter missing from workplace fetch',
    );
    assert.ok(
      /companyId=99/.test(workplaceCall.url),
      'Company parameter missing from workplace fetch',
    );
    assert.ok(
      /userId=321/.test(workplaceCall.url),
      'User parameter missing from workplace fetch',
    );

    const startToast = addToastCalls.find(
      (call) =>
        call.message.includes('Fetching workplaces with params') &&
        call.message.includes('"year":"2025"') &&
        call.message.includes('"month":"10"'),
    );
    assert.ok(startToast, 'Fetch start toast not emitted');
    assert.equal(startToast.type, 'info');
    assert.match(
      startToast.message,
      /Query: \/api\/reports\/workplaces\?year=2025&month=10&companyId=99&userId=321/,
      'Fetch start toast should include request query',
    );
    assert.ok(
      startToast.message.includes('"userId":"321"'),
      'Fetch start toast should include user identifier in params summary',
    );

    const successToast = addToastCalls.find(
      (call) => call.type === 'success' && call.message.includes('Workplace fetch params'),
    );
    assert.ok(successToast, 'Success toast not emitted for workplace fetch');
    assert.ok(
      successToast.message.includes('→ 1/1 valid assignments'),
      'Success toast should summarize assignment counts',
    );
    assert.ok(
      successToast.message.includes('SQL: SELECT * FROM tbl_employment_schedule WHERE emp_id = ? AND company_id = ?;'),
      'Success toast should include executed SQL when diagnostics are present',
    );
    assert.match(
      successToast.message,
      /Query: \/api\/reports\/workplaces\?year=2025&month=10&companyId=99&userId=321/,
      'Success toast should include request query',
    );
    assert.ok(
      successToast.message.includes('"userId":"321"'),
      'Success toast should include user identifier in params summary',
    );
    assert.ok(
      successToast.message.includes('session 22') || successToast.message.includes('#2'),
      'Success toast should reference fetched assignment identifiers',
    );

    delete global.fetch;
  });
}
