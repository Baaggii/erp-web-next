import test from 'node:test';
import assert from 'node:assert/strict';

global.document = {
  createElement(tag) {
    const el = {
      tagName: tag,
      nodeType: 1,
      children: [],
      style: {},
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
      },
      removeChild(child) {
        this.children = this.children.filter((c) => c !== child);
      },
      insertBefore(child, before) {
        const idx = this.children.indexOf(before);
        if (idx === -1) this.children.push(child);
        else this.children.splice(idx, 0, child);
        child.parentNode = this;
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      set textContent(text) {
        this._text = text;
      },
      get textContent() {
        if (this._text != null) return this._text;
        return this.children.map((c) => c.textContent).join('');
      },
      ownerDocument: null,
    };
    el.ownerDocument = global.document;
    return el;
  },
  createTextNode(text) {
    return { nodeType: 3, textContent: text, parentNode: null };
  },
};

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

let React, act, createRoot, useCompanyModules;
let haveReact = true;
try {
  const reactMod = await import('react');
  React = reactMod.default || reactMod;
  ({ act } = await import('react-dom/test-utils'));
  ({ createRoot } = await import('react-dom/client'));
  ({ useCompanyModules } = await import('../../src/erp.mgt.mn/hooks/useCompanyModules.js'));
} catch {
  haveReact = false;
}

function render(component) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(component);
  });
  return { container, root };
}

if (!haveReact) {
  test('useCompanyModules hook', { skip: true }, () => {});
} else {
  test('useCompanyModules(0) retrieves licenses and component renders', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => [{ module_key: 'finance_transactions', licensed: 1 }],
    });

    function TestComponent() {
      const licensed = useCompanyModules(0);
      return React.createElement('p', null, licensed ? 'loaded' : 'Ачааллаж байна...');
    }

    const { container, root } = render(React.createElement(TestComponent));
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(container.textContent, 'loaded');
    root.unmount();
  });

  test('useCompanyModules filters licenses by companyId', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => [
        { company_id: 0, module_key: 'finance_transactions', licensed: 1 },
        { company_id: 1, module_key: 'finance_reports', licensed: 1 },
      ],
    });

    function TestComponent() {
      const licensed = useCompanyModules(0);
      return React.createElement('p', null, licensed ? JSON.stringify(licensed) : '');
    }

    const { container, root } = render(React.createElement(TestComponent));
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(container.textContent, JSON.stringify({ finance_transactions: true }));
    root.unmount();
  });
}
