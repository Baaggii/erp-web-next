import test from 'node:test';
import assert from 'node:assert/strict';

class TestEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    const set = this._listeners.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._listeners.delete(type);
  }

  dispatchEvent(event) {
    if (!event) return true;
    if (!event.target) event.target = this;
    event.currentTarget = this;
    if (typeof event.preventDefault !== 'function') {
      event.defaultPrevented = false;
      event.preventDefault = () => {
        event.defaultPrevented = true;
      };
    }
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of [...listeners]) {
        listener.call(this, event);
      }
    }
    if (event.bubbles && this.parentNode && this.parentNode !== this) {
      this.parentNode.dispatchEvent(event);
    }
    return !event.defaultPrevented;
  }
}

class TestTextNode extends TestEventTarget {
  constructor(text) {
    super();
    this.nodeType = 3;
    this.parentNode = null;
    this._text = text;
  }

  get textContent() {
    return this._text;
  }

  set textContent(text) {
    this._text = text;
  }
}

class TestElement extends TestEventTarget {
  constructor(tagName) {
    super();
    this.tagName = String(tagName || '').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.ownerDocument = null;
    this.style = {};
    this.attributes = {};
    this.value = '';
    this.scrollWidth = 0;
    this.clientHeight = 0;
    this.clientWidth = 0;
    this.textContent = '';
  }

  appendChild(child) {
    if (!child) return child;
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  insertBefore(child, before) {
    const idx = this.children.indexOf(before);
    if (idx === -1) return this.appendChild(child);
    this.children.splice(idx, 0, child);
    child.parentNode = this;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class' || name === 'className') {
      this.className = String(value);
    }
    if (name === 'value') {
      this.value = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  focus() {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
    const listeners = this._listeners.get('focus');
    if (listeners) {
      for (const listener of [...listeners]) listener.call(this, { type: 'focus', target: this });
    }
  }

  blur() {
    const listeners = this._listeners.get('blur');
    if (listeners) {
      for (const listener of [...listeners]) listener.call(this, { type: 'blur', target: this });
    }
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
  }

  _collect(selector, results) {
    const tag = selector?.toUpperCase?.() || '';
    if (selector === 'input' && this.tagName === 'INPUT') results.push(this);
    if (selector === 'li' && this.tagName === 'LI') results.push(this);
    if (selector === this.tagName || selector === tag) results.push(this);
    for (const child of this.children) {
      if (typeof child._collect === 'function') {
        child._collect(selector, results);
      }
    }
  }

  querySelectorAll(selector) {
    const results = [];
    for (const child of this.children) {
      if (typeof child._collect === 'function') {
        child._collect(selector, results);
      }
    }
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class TestDocument extends TestEventTarget {
  constructor() {
    super();
    this.documentElement = new TestElement('html');
    this.body = new TestElement('body');
    this.documentElement.appendChild(this.body);
    this.body.ownerDocument = this;
    this.documentElement.ownerDocument = this;
    this.activeElement = null;
    this.defaultView = null;
  }

  createElement(tag) {
    const el = new TestElement(tag);
    el.ownerDocument = this;
    return el;
  }

  createTextNode(text) {
    const node = new TestTextNode(text);
    node.ownerDocument = this;
    return node;
  }

  contains(node) {
    const search = (current) => {
      if (current === node) return true;
      if (!current || !current.children) return false;
      return current.children.some((child) => search(child));
    };
    return search(this.body);
  }
}

if (!global.document || !global.document.createElement) {
  global.document = new TestDocument();
} else if (!(global.document instanceof TestDocument)) {
  global.document = new TestDocument();
}

if (!global.window) global.window = {};
if (typeof global.window.addEventListener !== 'function') {
  const listeners = new Map();
  global.window.addEventListener = (type, handler) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(handler);
  };
  global.window.removeEventListener = (type, handler) => {
    const set = listeners.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) listeners.delete(type);
  };
  global.window.dispatchEvent = (event) => {
    const set = listeners.get(event.type);
    if (set) {
      for (const handler of [...set]) handler.call(global.window, event);
    }
    return true;
  };
}
if (!global.window.document) global.window.document = global.document;
if (!global.document.defaultView) global.document.defaultView = global.window;
if (!global.window.innerWidth) global.window.innerWidth = 1024;
if (!global.window.innerHeight) global.window.innerHeight = 768;
if (!global.window.getComputedStyle) {
  global.window.getComputedStyle = () => ({ getPropertyValue: () => '', width: '0px' });
}

if (!global.KeyboardEvent) {
  class KeyboardEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.key = options.key || '';
      this.bubbles = options.bubbles ?? false;
      this.cancelable = options.cancelable ?? false;
    }
  }
  global.KeyboardEvent = KeyboardEvent;
}

let React;
let act;
let createRoot;
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
  test('AsyncSearchSelect allows manual entry without auto-match', { skip: true }, () => {});
} else {
  test('AsyncSearchSelect preserves manual value when Enter pressed without highlight', async (t) => {
    const origFetch = global.fetch;
    const fetchMock = t.mock.fn(async (input) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.startsWith('/api/tenant_tables/fruits')) {
        return { ok: true, json: async () => ({ tenantKeys: [] }) };
      }
      if (url.startsWith('/api/tables/fruits?')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              { id: 'apple', name: 'Apple' },
              { id: 'banana', name: 'Banana' },
            ],
            count: 2,
          }),
        };
      }
      return { ok: true, json: async () => ({ rows: [], count: 0 }) };
    });
    global.fetch = fetchMock;

    const mod = await t.mock.import('../../src/erp.mgt.mn/components/AsyncSearchSelect.jsx', {
      '../context/AuthContext.jsx': { AuthContext: React.createContext({}) },
    });
    const AsyncSearchSelect = mod.default || mod;

    const onChange = t.mock.fn();
    const onKeyDown = t.mock.fn();
    let inputNode = null;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          React.createElement(AsyncSearchSelect, {
            table: 'fruits',
            searchColumn: 'name',
            labelFields: ['name'],
            idField: 'id',
            value: '',
            onChange: (val) => onChange(val),
            onKeyDown: (e) => onKeyDown(e),
            inputRef: (node) => {
              inputNode = node;
            },
          }),
        );
      });

      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        await Promise.resolve();
      });

      assert.ok(inputNode, 'input ref should be assigned');

      await act(async () => {
        inputNode.focus?.();
      });

      await act(async () => {
        inputNode.value = 'manual-42';
        inputNode.dispatchEvent(new Event('input', { bubbles: true }));
      });

      await act(async () => {
        await Promise.resolve();
      });

      const beforeEnterCalls = onChange.mock.callCount();
      let observedEvent = null;
      onKeyDown.mockImplementation((event) => {
        observedEvent = event;
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        });
        inputNode.dispatchEvent(event);
        await Promise.resolve();
      });

      assert.equal(
        onChange.mock.callCount(),
        beforeEnterCalls,
        'onChange should not fire another change when Enter pressed without highlight',
      );
      const lastCall = onChange.mock.calls.at(-1);
      if (lastCall) {
        assert.equal(lastCall.arguments[0], 'manual-42');
      }
      assert.equal(inputNode.value, 'manual-42');
      assert.ok(observedEvent, 'onKeyDown should receive event');
      assert.notEqual(observedEvent.lookupMatched, false, 'lookupMatched should not be forced false');
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      global.fetch = origFetch;
    }
  });
}
