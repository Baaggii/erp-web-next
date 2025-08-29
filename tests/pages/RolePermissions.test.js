import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('RolePermissions page loads permissions when company is 0', { skip: true }, () => {});
} else {
  test('RolePermissions page loads permissions when company is 0', async () => {
    const states = [];
    let fetchUrl;
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

    const data = [
      { position_id: 1, module_key: 'mod', role: 'Role', label: 'Module', allowed: 1 },
    ];
    global.fetch = async (url) => {
      fetchUrl = url;
      return { ok: true, json: async () => data };
    };

    const { default: RolePermissions } = await mock.import(
      '../../src/erp.mgt.mn/pages/RolePermissions.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
      },
    );

    RolePermissions();
    await Promise.resolve();

    assert.equal(fetchUrl, '/api/role_permissions?companyId=0');
    assert.deepEqual(states[0], data);

    delete global.fetch;
  });
}

