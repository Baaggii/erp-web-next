import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ReportBuilder loads config from procedure', { skip: true }, () => {});
} else {
  test('ReportBuilder loads config from procedure', async () => {
    const states = [];
    let loadConfigHandler;
    let activateCodeTab;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect() {},
      useContext() {
        return { company: 0, permissions: { permissions: { system_settings: true } }, session: {} };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button') {
          if (text.includes('Code development')) {
            activateCodeTab = props.onClick;
          }
          if (text.includes('Load config from stored procedure')) {
            loadConfigHandler = props.onClick;
          }
        }
        return null;
      },
    };

    const addToastCalls = [];
    const sql = 'SELECT 1; /*REPORT_BUILDER_CONFIG {"procName":"abc","unionQueries":[]}*/';
    let fetchUrl;
    global.fetch = async (url) => {
      fetchUrl = url;
      return { ok: true, json: async () => ({ sql }) };
    };

    const { default: ReportBuilder } = await mock.import(
      '../../src/erp.mgt.mn/pages/ReportBuilder.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../utils/buildStoredProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: (msg, type) => addToastCalls.push({ msg, type }) }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    ReportBuilder();
    activateCodeTab?.();

    // selectedDbProcedure
    states[28] = 'proc1';
    states[29] = '';
    states[30] = '';

    await loadConfigHandler();

    assert.equal(fetchUrl, '/api/report_builder/procedures/proc1');
    assert.equal(states[4], 'abc');
    assert.deepEqual(addToastCalls, [
      { msg: 'Loaded config from embedded block', type: 'success' },
    ]);

    delete global.fetch;
  });

  test('ReportBuilder loads config when Load Config clicked', async () => {
    const states = [];
    let loadConfigHandler;
    let activateCodeTab;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect() {},
      useContext() {
        return {
          company: 0,
          permissions: { permissions: { system_settings: true } },
          session: {},
        };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button') {
          if (text.includes('Code development')) {
            activateCodeTab = props.onClick;
          }
          if (text.includes('Load Config')) {
            loadConfigHandler = props.onClick;
          }
        }
        return null;
      },
    };

    let fetchUrl;
    global.fetch = async (url) => {
      fetchUrl = url;
      return { ok: true, json: async () => ({ procName: 'abc', unionQueries: [] }) };
    };

    const { default: ReportBuilder } = await mock.import(
      '../../src/erp.mgt.mn/pages/ReportBuilder.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../utils/buildStoredProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast() {} }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    ReportBuilder();
    activateCodeTab?.();

    // selectedReport
    states[24] = 'cfg1';

    await loadConfigHandler({});

    assert.equal(fetchUrl, '/api/report_builder/configs/cfg1');
    assert.equal(states[4], 'abc');

    delete global.fetch;
  });

  test('ReportBuilder auto-generates config when missing', async () => {
    const states = [];
    let loadConfigHandler;
    let activateCodeTab;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect() {},
      useContext() {
        return { company: 0, permissions: { permissions: { system_settings: true } }, session: {} };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button') {
          if (text.includes('Code development')) {
            activateCodeTab = props.onClick;
          }
          if (text.includes('Load config from stored procedure')) {
            loadConfigHandler = props.onClick;
          }
        }
        return null;
      },
    };

    const addToastCalls = [];
    const sql = 'SELECT 1';
    const generated = { config: { procName: 'abc', unionQueries: [] }, converted: true };
    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      if (url === '/api/report_builder/procedures/proc1') {
        return { ok: true, json: async () => ({ sql }) };
      }
      if (url === '/api/report_builder/procedures/proc1/config') {
        return { ok: true, json: async () => ({ ok: true, config: generated }) };
      }
      return { ok: true, json: async () => ({}) };
    };

    const { default: ReportBuilder } = await mock.import(
      '../../src/erp.mgt.mn/pages/ReportBuilder.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../utils/buildStoredProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: (msg, type) => addToastCalls.push({ msg, type }) }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    ReportBuilder();
    activateCodeTab?.();

    // selectedDbProcedure
    states[28] = 'proc1';
    states[29] = '';
    states[30] = '';

    await loadConfigHandler();

    assert.deepEqual(fetchCalls.map((c) => c.url), [
      '/api/report_builder/procedures/proc1',
      '/api/report_builder/procedures/proc1/config',
    ]);
    assert.equal(states[4], 'abc');
    assert.deepEqual(addToastCalls, [
      { msg: 'Generated config from SQL', type: 'success' },
    ]);

    delete global.fetch;
  });

  test('ReportBuilder surfaces parsing errors', async () => {
    const states = [];
    let loadConfigHandler;
    let activateCodeTab;
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect() {},
      useContext() {
        return { company: 0, permissions: { permissions: { system_settings: true } }, session: {} };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button') {
          if (text.includes('Code development')) {
            activateCodeTab = props.onClick;
          }
          if (text.includes('Load config from stored procedure')) {
            loadConfigHandler = props.onClick;
          }
        }
        return null;
      },
    };

    const addToastCalls = [];
    const sql =
      'CREATE PROCEDURE t() BEGIN SELECT p.id FROM prod p GROUP BY p.id HAVING COUNT(*) > 1; END';
    let fetchUrl;
    global.fetch = async (url) => {
      fetchUrl = url;
      return { ok: true, json: async () => ({ sql }) };
    };

    const { default: ReportBuilder } = await mock.import(
      '../../src/erp.mgt.mn/pages/ReportBuilder.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../utils/buildStoredProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast: (msg, type) => addToastCalls.push({ msg, type }) }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    ReportBuilder();
    activateCodeTab?.();

    // selectedDbProcedure
    states[28] = 'proc1';
    states[29] = '';
    states[30] = '';

    await loadConfigHandler();

    assert.equal(fetchUrl, '/api/report_builder/procedures/proc1');
    assert.deepEqual(addToastCalls, [
      { msg: 'Unsupported HAVING clause', type: 'error' },
    ]);

    delete global.fetch;
  });

  test('ReportBuilder shows full procedures list with trimmed labels', async () => {
    const states = [];
    const optionCalls = [];
    const overrides = {
      27: [
        { name: 'dynrep_0_proc1', isDefault: true },
        { name: 'dynrep_custom', isDefault: false },
        { name: 'legacy_proc', isDefault: false },
      ],
    };
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        const value = Object.prototype.hasOwnProperty.call(overrides, idx)
          ? overrides[idx]
          : initial;
        states.push(value);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect() {},
      useContext() {
        return {
          company: 0,
          permissions: { permissions: { system_settings: true } },
          session: {},
        };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'option') {
          optionCalls.push({ value: props?.value, label: text });
        }
        return null;
      },
    };

    global.fetch = async () => ({ ok: true, json: async () => ({}) });

    const { default: ReportBuilder } = await mock.import(
      '../../src/erp.mgt.mn/pages/ReportBuilder.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../utils/buildStoredProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { reportProcPrefix: 'dynrep_' } }),
        },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast() {} }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    ReportBuilder();

    const relevant = optionCalls.filter((opt) =>
      ['dynrep_0_proc1', 'dynrep_custom', 'legacy_proc'].includes(opt.value),
    );

    assert.deepEqual(relevant, [
      { value: 'dynrep_0_proc1', label: '0_proc1' },
      { value: 'dynrep_custom', label: 'custom' },
      { value: 'legacy_proc', label: 'legacy_proc' },
    ]);

    delete global.fetch;
  });

  test('handlePostProc keeps unfiltered procedures when reloading', async () => {
    const states = [];
    let postHandler;
    const overrides = {
      4: 'proc1',
      19: 'SQL',
      27: [{ name: 'dynrep_0_proc1', isDefault: true }],
    };
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        const value = Object.prototype.hasOwnProperty.call(overrides, idx)
          ? overrides[idx]
          : initial;
        states.push(value);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect() {},
      useContext() {
        return {
          company: 0,
          permissions: { permissions: { system_settings: true } },
          session: {},
        };
      },
      createElement(type, props, ...children) {
        if (typeof type === 'function') {
          return type({ ...props, children });
        }
        const text = children.flat ? children.flat().join('') : children.join('');
        if (type === 'button' && text.includes('POST Procedure')) {
          postHandler = props.onClick;
        }
        return null;
      },
    };

    const fetchCalls = [];
    global.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      if (opts?.method === 'POST') {
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({
          names: [
            { name: 'dynrep_0_proc1', isDefault: true },
            { name: 'dynrep_custom', isDefault: false },
          ],
        }),
      };
    };

    const originalWindow = global.window;
    const originalCustomEvent = global.CustomEvent;
    global.window = {
      confirm: () => true,
      dispatchEvent() {},
    };
    global.CustomEvent = function CustomEvent() {};

    const { default: ReportBuilder } = await mock.import(
      '../../src/erp.mgt.mn/pages/ReportBuilder.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
          createElement: reactMock.createElement,
        },
        '../utils/buildStoredProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': {
          default: () => ({ general: { reportProcPrefix: 'dynrep_' } }),
        },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast() {} }),
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    ReportBuilder();
    await postHandler?.();

    assert.deepEqual(
      fetchCalls.map((c) => c.url),
      [
        '/api/report_builder/procedures',
        '/api/report_builder/procedures?prefix=dynrep_&includeAll=true',
      ],
    );
    assert.deepEqual(states[27], [
      { name: 'dynrep_0_proc1', isDefault: true },
      { name: 'dynrep_custom', isDefault: false },
    ]);

    delete global.fetch;
    if (originalWindow === undefined) {
      delete global.window;
    } else {
      global.window = originalWindow;
    }
    if (originalCustomEvent === undefined) {
      delete global.CustomEvent;
    } else {
      global.CustomEvent = originalCustomEvent;
    }
  });
}
