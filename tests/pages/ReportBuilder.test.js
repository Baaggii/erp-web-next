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
        '../utils/buildTenantNormalizedProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../utils/fetchTenantTableOptions.js': { default: async () => [] },
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
        '../utils/buildTenantNormalizedProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../utils/fetchTenantTableOptions.js': { default: async () => [] },
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
        '../utils/buildTenantNormalizedProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../utils/fetchTenantTableOptions.js': { default: async () => [] },
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
        '../utils/buildTenantNormalizedProcedure.js': { default: () => '' },
        '../utils/buildReportSql.js': { default: () => '' },
        '../components/ErrorBoundary.jsx': { default: (p) => p.children },
        '../hooks/useGeneralConfig.js': { default: () => ({ general: {} }) },
        '../utils/formatSqlValue.js': { default: (v) => v },
        '../utils/fetchTenantTableOptions.js': { default: async () => [] },
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
}
