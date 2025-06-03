import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import { useState } from 'react';
import 'react-mosaic-component/react-mosaic-component.css';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';

export default function MosaicLayout() {
  const [layout, setLayout] = useState({
    direction: 'row',
    first: 'gl',
    second: 'po',
    splitPercentage: 70,
  });

  return (
    <Mosaic
      className="mosaic-blueprint-theme"
      value={layout}
      onChange={setLayout}
      renderTile={(id, path) => {
        let title;
        let Component;
        switch (id) {
          case 'gl':
            title = 'General Ledger';
            Component = GLInquiry;
            break;
          case 'po':
            title = 'Purchase Orders';
            Component = PurchaseOrders;
            break;
          case 'sales':
            title = 'Sales Dashboard';
            Component = SalesDashboard;
            break;
          default:
            return null;
        }
        return (
          <MosaicWindow title={title} path={path}>
            <Component />
          </MosaicWindow>
        );
      }}
    />
  );
}
