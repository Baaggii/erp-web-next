import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

let React;
let act;
let createRoot;
let haveReact = true;
let JSDOM;
let haveDom = true;

try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
} catch {
  haveReact = false;
}

try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  haveDom = false;
}

const withDom = async (fn) => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalNavigator = global.navigator;
  const originalRAF = global.requestAnimationFrame;

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

  if (!global.window.requestAnimationFrame) {
    global.window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
  global.requestAnimationFrame = global.window.requestAnimationFrame.bind(global.window);

  try {
    await fn();
  } finally {
    if (originalWindow) global.window = originalWindow;
    else delete global.window;
    if (originalDocument) global.document = originalDocument;
    else delete global.document;
    if (originalNavigator) global.navigator = originalNavigator;
    else delete global.navigator;
    if (originalRAF) global.requestAnimationFrame = originalRAF;
    else delete global.requestAnimationFrame;
  }
};

if (!haveReact || !haveDom || typeof mock?.fn !== 'function') {
  test('CustomDatePicker allows manual keyboard entry', { skip: true }, () => {});
  test('CustomDatePicker syncs native picker selections', { skip: true }, () => {});
} else {
  test('CustomDatePicker allows manual keyboard entry', async (t) => {
    await withDom(async () => {
      const { default: CustomDatePicker } = await import(
        '../../src/erp.mgt.mn/components/CustomDatePicker.jsx'
      );
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      const handleChange = mock.fn();
      const handleValidity = mock.fn();

      await act(async () => {
        root.render(
          React.createElement(CustomDatePicker, {
            value: '',
            onChange: handleChange,
            onValidityChange: handleValidity,
          }),
        );
      });

      const textInput = container.querySelector('input[type="text"]');
      assert.ok(textInput, 'text input should be rendered');

      await act(async () => {
        textInput.value = '2025.11.30';
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      assert.equal(textInput.value, '2025-11-30');
      assert.equal(handleChange.mock.calls.length, 1);
      assert.equal(handleChange.mock.calls[0].arguments[0], '2025-11-30');

      await act(async () => {
        textInput.value = '2025.11.31';
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      assert.equal(handleChange.mock.calls.length, 1, 'invalid dates should not trigger change');
      assert.equal(textInput.validationMessage, 'Invalid date');
      assert.equal(textInput.getAttribute('aria-invalid'), 'true');
      const lastValidityCall = handleValidity.mock.calls[handleValidity.mock.calls.length - 1];
      assert.equal(lastValidityCall.arguments[0], false);

      await act(async () => {
        textInput.value = '2025-11-30';
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      assert.equal(textInput.validationMessage, '');
      assert.equal(textInput.getAttribute('aria-invalid'), null);
      const finalValidityCall = handleValidity.mock.calls[handleValidity.mock.calls.length - 1];
      assert.equal(finalValidityCall.arguments[0], true);

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });

  test('CustomDatePicker syncs native picker selections', async (t) => {
    await withDom(async () => {
      const { default: CustomDatePicker } = await import(
        '../../src/erp.mgt.mn/components/CustomDatePicker.jsx'
      );
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      const handleChange = mock.fn();

      await act(async () => {
        root.render(
          React.createElement(CustomDatePicker, {
            value: '',
            onChange: handleChange,
          }),
        );
      });

      const pickerInput = container.querySelector('input[type="date"]');
      const textInput = container.querySelector('input[type="text"]');
      assert.ok(pickerInput, 'hidden date input should render');
      assert.ok(textInput, 'text input should render');

      await act(async () => {
        pickerInput.value = '2024-12-05';
        pickerInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      assert.equal(handleChange.mock.calls.length, 1);
      assert.equal(handleChange.mock.calls[0].arguments[0], '2024-12-05');
      assert.equal(textInput.value, '2024-12-05');

      await act(async () => {
        root.unmount();
      });
      container.remove();
    });
  });
}
