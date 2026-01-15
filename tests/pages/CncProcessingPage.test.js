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

async function renderCncProcessingPage(addToast, fetchStub) {
  const { dom, prev } = setupDom();
  const prevFetch = global.fetch;
  if (fetchStub) {
    global.fetch = fetchStub;
  }

  const { default: CncProcessingPage } = await mock.import(
    '../../src/erp.mgt.mn/pages/CncProcessingPage.jsx',
    {
      '../context/ToastContext.jsx': {
        useToast: () => ({ addToast }),
      },
    },
  );

  const user = userEvent.setup();
  const utils = render(React.createElement(CncProcessingPage));

  async function cleanupAll() {
    await cleanup();
    mock.restoreAll();
    restoreDom(dom, prev);
    global.fetch = prevFetch;
  }

  return { user, cleanupAll, ...utils };
}

if (!haveRTL) {
  test('CncProcessingPage renders and submits uploads', { skip: true }, () => {});
} else {
  test('CncProcessingPage renders the upload form', async () => {
    const addToast = mock.fn();
    const { cleanupAll } = await renderCncProcessingPage(addToast);

    assert.ok(screen.getByText('CNC Converter'));
    assert.ok(screen.getByLabelText('Source file'));
    assert.ok(screen.getByRole('button', { name: 'Start conversion' }));

    await cleanupAll();
  });

  test('CncProcessingPage handles upload progress and download link', async () => {
    const addToast = mock.fn();
    let resolveFetch;
    const fetchStub = mock.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const { user, cleanupAll } = await renderCncProcessingPage(addToast, fetchStub);

    const fileInput = screen.getByLabelText('Source file');
    const file = new window.File(['fake'], 'sample.png', { type: 'image/png' });
    await user.upload(fileInput, file);

    fireEvent.click(screen.getByRole('button', { name: 'Start conversion' }));

    await waitFor(() => {
      assert.ok(screen.getByText('Processing...'));
      assert.ok(screen.getByText(/\d+%/));
    });

    resolveFetch({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        downloadUrl: 'http://example.com/output.gcode',
        filename: 'output.gcode',
      }),
    });

    await waitFor(() => {
      assert.ok(screen.getByText('Conversion complete.'));
    });

    const link = screen.getByRole('link', { name: 'Download output.gcode' });
    assert.equal(link.getAttribute('href'), 'http://example.com/output.gcode');

    assert.equal(fetchStub.mock.calls.length, 1);
    assert.ok(addToast.mock.calls.length > 0);

    await cleanupAll();
  });
}
