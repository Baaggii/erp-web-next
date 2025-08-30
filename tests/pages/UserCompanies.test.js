import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('UserCompanies page loads assignments when company is 0', { skip: true }, () => {});
} else {
  test('UserCompanies page loads assignments and limits companies to creator', async () => {
    const states = [];
    const fetchUrls = [];
    const reactMock = {
      useState(initial) {
        const idx = states.length;
        states.push(initial);
        return [states[idx], (v) => (states[idx] = v)];
      },
      useEffect(fn) { fn(); },
      useContext() {
        return { company: 0 };
      },
      createElement() { return null; },
    };

    const actingAdmin = 'e1';
    const assignmentData = [
      {
        empid: actingAdmin,
        company_id: 0,
        company_name: 'Comp',
        branch_name: 'Branch',
        position: 'Pos',
      },
    ];
    const companiesData = [
      { id: 1, name: 'Comp', created_by: actingAdmin },
    ];
    const responses = {
      '/api/user_companies?companyId=0': assignmentData,
      '/api/users': [],
      '/api/companies': companiesData,
      '/api/tables/code_branches?perPage=500': { rows: [] },
    };
    global.fetch = async (url) => {
      fetchUrls.push(url);
      return { ok: true, json: async () => responses[url] };
    };

    const { default: UserCompanies } = await mock.import(
      '../../src/erp.mgt.mn/pages/UserCompanies.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../utils/debug.js': { debugLog: () => {} },
      },
    );

    UserCompanies();
    await Promise.resolve();

    assert.ok(fetchUrls.includes('/api/user_companies?companyId=0'));
    assert.ok(fetchUrls.includes('/api/companies'));
    assert.deepEqual(states[0], assignmentData);
    assert.deepEqual(states[3], companiesData);
    assert.ok(states[3].every((c) => c.created_by === actingAdmin));

    delete global.fetch;
  });
}

