import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import { useState, useEffect } from 'react';
import 'react-mosaic-component/react-mosaic-component.css';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import TabbedWindows from './TabbedWindows.jsx';
import Inventory from '../windows/Inventory.jsx';
import OrderEntry from '../windows/OrderEntry.jsx';
import Accounting from '../windows/Accounting.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';
import ImageManagement from '../windows/ImageManagement.jsx';

export default function MosaicLayout({ initialLayout }) {
  const defaultLayout = {
    direction: 'row',
    first: 'gl',
    second: 'po',
    splitPercentage: 70,
  };
  const [layout, setLayout] = useState(initialLayout || defaultLayout);

  useEffect(() => {
    if (initialLayout) {
      setLayout(initialLayout);
    }
  }, [initialLayout]);

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
            Component = TabbedWindows;
            break;
          case 'dashboard':
            title = 'Dashboard';
            Component = SalesDashboard;
            break;
          case 'inventory':
            title = 'Inventory';
            Component = Inventory;
            break;
          case 'orders':
            title = 'Order Entry';
            Component = OrderEntry;
            break;
          case 'acct':
            title = 'Accounting';
            Component = Accounting;
            break;
          case 'images':
            title = 'Image Management';
            Component = ImageManagement;
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
