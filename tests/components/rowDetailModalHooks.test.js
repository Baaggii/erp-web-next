import test from 'node:test';
import assert from 'node:assert/strict';

global.document = { createElement: () => ({}) };
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {},
};

let React, act, createRoot;
let haveReact = true;
try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
} catch {
  haveReact = false;
}

if (!haveReact) {
  test('RowDetailModal hook order stable when toggling visibility', { skip: true }, () => {});
} else {
  test('RowDetailModal hook order stable when toggling visibility', async (t) => {
    const { default: RowDetailModal } = await t.mock.import(
      '../../src/erp.mgt.mn/components/RowDetailModal.jsx',
      {
        './Modal.jsx': { default: () => null },
        'react-i18next': { useTranslation: () => ({ t: (_, d) => d }) },
      },
    );

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(RowDetailModal, { visible: false }));
    });

    assert.doesNotThrow(() => {
      act(() => {
        root.render(React.createElement(RowDetailModal, { visible: true }));
      });
    });

    root.unmount();
  });
}
