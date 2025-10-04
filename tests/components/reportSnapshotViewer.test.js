import test from 'node:test';
import assert from 'node:assert/strict';

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
  test('ReportSnapshotViewer loads artifact rows', { skip: true }, () => {});
} else {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.window.fetch = undefined;

  test('ReportSnapshotViewer loads artifact rows', async (t) => {
    const fetchCalls = [];
    global.fetch = async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        async json() {
          return {
            rows: [
              { id: 1, value: 'first' },
              { id: 2, value: 'second' },
            ],
            rowCount: 2,
            columns: ['id', 'value'],
          };
        },
      };
    };

    const { default: ReportSnapshotViewer } = await t.mock.import(
      '../../src/erp.mgt.mn/components/ReportSnapshotViewer.jsx',
      {},
    );

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(ReportSnapshotViewer, {
          snapshot: {
            artifact: { id: 'artifact-123', rowCount: 2 },
            rowCount: 2,
            columns: ['id', 'value'],
            rows: [],
          },
          formatValue: (value) => String(value ?? ''),
        }),
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(fetchCalls.length, 1);
    assert.ok(
      fetchCalls[0].includes('/api/report_snapshot_artifacts/artifact-123'),
      'should request artifact rows',
    );
    assert.ok(container.textContent.includes('first'));
    assert.ok(container.textContent.includes('Download full dataset'));
    root.unmount();
  });
}
