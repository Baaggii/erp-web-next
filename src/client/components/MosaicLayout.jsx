// in MosaicLayout.jsx
import { lazy, Suspense } from 'react';
import React from 'react';
import { Mosaic, MosaicWindow } from 'react-mosaic-component';

import SalesDashboard   from '../windows/SalesDashboard.jsx';
import GLInquiry        from '../windows/GLInquiry.jsx';
import PurchaseOrders   from '../windows/PurchaseOrders.jsx';
import ReportsViewer    from '../windows/ReportsViewer.jsx';

const SalesDashboard = lazy(() => import('../windows/SalesDashboard'));
const GLInquiry      = lazy(() => import('../windows/GLInquiry'));
// …

function renderTile(id, path) {
  let Content;
  switch (id) {
    case 'sales':    Content = SalesDashboard; break;
    case 'gl':       Content = GLInquiry;      break;
    case 'purchase': Content = PurchaseOrders; break;
    case 'reports':  Content = ReportsViewer;  break;
    default:         Content = () => <div>Unknown Window</div>;
  }

   return (
     <MosaicWindow path={path} title={id.toUpperCase()}>
      <Content />
     </MosaicWindow>
   );
 }
