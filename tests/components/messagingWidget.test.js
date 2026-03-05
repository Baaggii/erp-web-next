import test from 'node:test';
import assert from 'node:assert/strict';

let React;
let createRoot;
let act;
let haveReact = true;

try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ createRoot } = await import('react-dom/client'));
  ({ act } = await import('react-dom/test-utils'));
} catch {
  haveReact = false;
}

if (!haveReact) {
  test('MessagingWidget render', { skip: true }, () => {});
} else {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.fetch = async (url) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/messaging/conversations/') && requestUrl.includes('/messages')) {
      return { ok: true, async json() { return { conversationId: 1, items: [], pageInfo: { page: 1 } }; } };
    }
    if (requestUrl.includes('/messaging/conversations')) {
      return { ok: true, async json() { return { items: [], pageInfo: { page: 1 } }; } };
    }
    if (requestUrl.includes('/messaging/presence')) {
      return { ok: true, async json() { return { users: [] }; } };
    }
    return { ok: true, async json() { return { items: [] }; } };
  };

  test('MessagingWidget toggles from collapsed to expanded', async (t) => {
    const contextMod = await import('../../src/erp.mgt.mn/context/AuthContext.jsx');
    const AuthContext = contextMod.AuthContext;
    const { default: MessagingWidget } = await t.mock.import('../../src/erp.mgt.mn/components/MessagingWidget.jsx', {
      '../utils/socket.js': {
        connectSocket: () => ({ on: () => {}, off: () => {} }),
        disconnectSocket: () => {},
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: { session: { id: 'sess-1', company_id: '1' }, user: { empid: 'E001' }, permissions: {}, company: '1' } },
          React.createElement(MessagingWidget),
        ),
      );
    });

    const openButton = container.querySelector('[aria-label="Open messaging widget"]');
    assert.ok(openButton);

    await act(async () => {
      openButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });

    assert.ok(container.querySelector('[aria-label="Messaging widget"]'));

    root.unmount();
  });

  test('MessagingWidget employee list is sourced from /api/users', async (t) => {
    const requestLog = [];
    global.fetch = async (url) => {
      const requestUrl = String(url);
      requestLog.push(requestUrl);
      if (requestUrl.includes('/messaging/conversations/') && requestUrl.includes('/messages')) {
        return { ok: true, async json() { return { conversationId: 1, items: [], pageInfo: { page: 1 } }; } };
      }
      if (requestUrl.includes('/messaging/conversations')) {
        return { ok: true, async json() { return { items: [], pageInfo: { page: 1 } }; } };
      }
      if (requestUrl.includes('/messaging/presence')) {
        return { ok: true, async json() { return { users: [] }; } };
      }
      if (requestUrl.includes('/api/users?companyId=1')) {
        return { ok: true, async json() { return [{ id: 1, empid: 'E001', full_name: 'Emp One' }]; } };
      }
      if (requestUrl.includes('/api/display_fields?table=tbl_employee')) {
        return { ok: true, async json() { return { displayFields: ['emp_fname'] }; } };
      }
      if (requestUrl.includes('/tables/tbl_employee')) {
        return { ok: true, async json() { return { rows: [{ emp_id: 'E001', emp_fname: 'Emp One' }] }; } };
      }
      return { ok: true, async json() { return { items: [] }; } };
    };

    const contextMod = await import('../../src/erp.mgt.mn/context/AuthContext.jsx');
    const AuthContext = contextMod.AuthContext;
    const { default: MessagingWidget } = await t.mock.import('../../src/erp.mgt.mn/components/MessagingWidget.jsx', {
      '../utils/socket.js': {
        connectSocket: () => ({ on: () => {}, off: () => {} }),
        disconnectSocket: () => {},
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        React.createElement(
          AuthContext.Provider,
          { value: { session: { id: 'sess-1', company_id: '1' }, user: { empid: 'E001' }, permissions: {}, company: '1' } },
          React.createElement(MessagingWidget),
        ),
      );
    });

    assert.ok(requestLog.some((url) => url.includes('/api/users?companyId=1')));
    assert.equal(requestLog.some((url) => url.includes('/tables/tbl_employment')), false);

    root.unmount();
  });

}
