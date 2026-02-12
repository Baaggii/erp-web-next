import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let React;
let render;
let screen;
let cleanup;
let fireEvent;
let waitFor;
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
} catch {
  haveRTL = false;
}

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
    localStorage: global.localStorage,
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
  global.requestAnimationFrame = dom.window.requestAnimationFrame?.bind(dom.window) || ((cb) => setTimeout(cb, 0));
  global.cancelAnimationFrame = dom.window.cancelAnimationFrame?.bind(dom.window) || ((id) => clearTimeout(id));
  global.localStorage = dom.window.localStorage;
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
  global.localStorage = prev.localStorage;
}

if (!haveRTL) {
  test('ImageManagement detect from host interaction', { skip: true }, () => {});
} else {
  test('ImageManagement detect from host stays responsive and reports failures', async () => {
    const { dom, prev } = setupDom();
    const addToast = mock.fn();
    const fetchStub = mock.fn(async () => ({ ok: false, status: 500 }));
    const prevFetch = global.fetch;
    global.fetch = fetchStub;

    const AuthContextMock = React.createContext({ company: 1, session: {} });

    const { default: ImageManagement } = await mock.import(
      '../../src/erp.mgt.mn/pages/ImageManagement.jsx',
      {
        '../context/ToastContext.jsx': {
          useToast: () => ({ addToast }),
        },
        '../context/AuthContext.jsx': {
          AuthContext: AuthContextMock,
        },
      },
    );

    render(
      React.createElement(
        AuthContextMock.Provider,
        { value: { company: 1, session: {} } },
        React.createElement(ImageManagement),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fix Names' }));
    fireEvent.click(screen.getByRole('button', { name: 'Detect from host' }));

    await waitFor(() => {
      assert.equal(fetchStub.mock.calls.length, 1);
    });

    assert.match(fetchStub.mock.calls[0].arguments[0], /\/api\/transaction_images\/detect_incomplete\?page=1&pageSize=200&companyId=1/);

    await waitFor(() => {
      assert.ok(addToast.mock.calls.some((call) => call.arguments[0] === 'Detect from host failed'));
    });

    await cleanup();
    mock.restoreAll();
    restoreDom(dom, prev);
    global.fetch = prevFetch;
  });
}
