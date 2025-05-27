// src/client/components/MosaicLayout.jsx
import React from 'react';
import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';

import SalesDashboard from '../windows/SalesDashboard.jsx';
import GLInquiry      from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import ReportsViewer  from '../windows/ReportsViewer.jsx';

export default function MosaicLayout() {
  // initial split: sales on left; right side is GL+purchase stacked above reports
  const initialValue = {
    direction: 'row',
    first: 'sales',
    second: {
      direction: 'column',
      first: {
        direction: 'row',
        first: 'gl',
        second: 'purchase',
      },
      second: 'reports',
    },
  };

  const renderTile = (id, path) => {
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
  };

  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
      <Mosaic
        renderTile={renderTile}
        initialValue={initialValue}
        className="mosaic-blueprint-theme"
      />
    </div>
  );
}
