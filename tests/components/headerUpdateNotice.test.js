import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

function createMockReact() {
  const ReactMock = {
    Fragment: Symbol('Fragment'),
  };

  ReactMock.createElement = (type, props, ...children) => ({
    type,
    props: props || {},
    children,
  });

  ReactMock.createContext = (defaultValue) => {
    const context = {
      _currentValue: defaultValue,
      Provider: ({ value, children }) => {
        context._currentValue = value;
        return children;
      },
    };
    return context;
  };

  ReactMock.useContext = (context) => context._currentValue;
  ReactMock.useState = (initial) => [typeof initial === 'function' ? initial() : initial, () => {}];
  ReactMock.useEffect = () => {};
  ReactMock.useMemo = (factory) => factory();
  ReactMock.useCallback = (fn) => fn;
  ReactMock.useRef = (initial) => ({ current: initial });

  return ReactMock;
}

function collectStrings(node, acc = []) {
  if (node === null || node === undefined) return acc;
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectStrings(child, acc));
    return acc;
  }
  if (typeof node === 'object') {
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => collectStrings(child, acc));
    }
    if (node.props && node.props.children !== undefined) {
      collectStrings(node.props.children, acc);
    }
  }
  return acc;
}

if (typeof mock?.import !== 'function') {
  test('Header renders refresh notice when update flag becomes true', { skip: true }, () => {});
} else {
  test('Header renders refresh notice when update flag becomes true', async () => {
    const mockReact = createMockReact();
    const TestAuthContext = mockReact.createContext({ session: null });
    const TestLangContext = mockReact.createContext({
      lang: 'en',
      setLang: () => {},
      t: (key, fallback) => fallback ?? key,
    });

    const { Header } = await mock.import(
      '../../src/erp.mgt.mn/components/ERPLayout.jsx',
      {
        react: {
          default: mockReact,
          ...mockReact,
        },
        '../context/AuthContext.jsx': { AuthContext: TestAuthContext },
        '../context/I18nContext.jsx': { default: TestLangContext },
        './HeaderMenu.jsx': {
          default: () => mockReact.createElement('div', {}, 'header-menu'),
        },
        './UserMenu.jsx': {
          default: () => mockReact.createElement('div', {}, 'user-menu'),
        },
      },
    );

    const originalWindow = global.window;
    global.window = { location: { reload: () => {} } };

    const baseProps = {
      user: { name: 'User' },
      onLogout: () => {},
      onHome: () => {},
      isMobile: false,
      onToggleSidebar: () => {},
      onOpen: () => {},
      onResetGuide: () => {},
    };

    TestAuthContext._currentValue = { session: { company_name: 'Acme Co.' } };
    TestLangContext._currentValue = {
      lang: 'en',
      setLang: () => {},
      t: (key, fallback) => fallback ?? key,
    };

    const withoutUpdateTree = Header({ ...baseProps, hasUpdateAvailable: false });
    const withoutUpdateText = collectStrings(withoutUpdateTree).join(' ');
    assert.ok(!withoutUpdateText.includes('Refresh to update'));

    const withUpdateTree = Header({ ...baseProps, hasUpdateAvailable: true });
    const withUpdateText = collectStrings(withUpdateTree).join(' ');
    assert.ok(withUpdateText.includes('Refresh to update'));

    global.window = originalWindow;
  });
}
