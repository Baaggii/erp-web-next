import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('ReportBuilder loads config from procedure', { skip: true }, () => {});
} else {
  test('ReportBuilder loads config from procedure', async () => {
    const states = [];
    let loadConfigHandler;
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
        if (type === 'button' && text.includes('Load config from stored procedure')) {
          loadConfigHandler = props.onClick;
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

  test('ReportBuilder auto-generates config when missing', async () => {
    const states = [];
    let loadConfigHandler;
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
        if (type === 'button' && text.includes('Load config from stored procedure')) {
          loadConfigHandler = props.onClick;
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
}
