// in MosaicLayout.jsx
import { lazy, Suspense } from 'react';

const SalesDashboard = lazy(() => import('../windows/SalesDashboard'));
const GLInquiry      = lazy(() => import('../windows/GLInquiry'));
// …

function renderTile(id, path) {
  let Comp;
  switch (id) {
    case 'sales':   Comp = SalesDashboard; break;
    case 'gl':      Comp = GLInquiry;      break;
    // …
  }
  return (
    <MosaicWindow path={path} title={id}>
      <Suspense fallback={<div>Loading…</div>}>
        <Comp />
      </Suspense>
    </MosaicWindow>
  );
}
