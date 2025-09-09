import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

if (typeof mock.import !== 'function') {
  test('Users page loads data when company is 0', { skip: true }, () => {});
} else {
  test('Users page loads data when company is 0', async () => {
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

    const data = [{ id: 1, empid: 'john', position: 'boss' }];
    global.fetch = async (url) => {
      fetchUrl = url;
      return { ok: true, json: async () => data };
    };

    const { default: Users } = await mock.import(
      '../../src/erp.mgt.mn/pages/Users.jsx',
      {
        react: {
          default: reactMock,
          useState: reactMock.useState,
          useEffect: reactMock.useEffect,
          useContext: reactMock.useContext,
        },
        '../context/AuthContext.jsx': { AuthContext: {} },
        '../utils/debug.js': { debugLog: () => {} },
        '../context/ToastContext.jsx': { useToast: () => ({ addToast: () => {} }) },
      },
    );

    Users();
    await Promise.resolve();

    assert.equal(fetchUrl, '/api/users?companyId=0');
    assert.deepEqual(states[0], data);

    delete global.fetch;
  });
}

