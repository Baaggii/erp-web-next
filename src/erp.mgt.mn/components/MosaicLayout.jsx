import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import { useState, useEffect, useContext } from 'react';
import 'react-mosaic-component/react-mosaic-component.css';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import TabbedWindows from './TabbedWindows.jsx';
import Inventory from '../windows/Inventory.jsx';
import OrderEntry from '../windows/OrderEntry.jsx';
import Accounting from '../windows/Accounting.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';
import I18nContext from '../context/I18nContext.jsx';

export default function MosaicLayout({ initialLayout }) {
  const defaultLayout = {
    direction: 'row',
    first: 'gl',
    second: 'po',
    splitPercentage: 70,
  };
  const [layout, setLayout] = useState(initialLayout || defaultLayout);
  const { t } = useContext(I18nContext);

  useEffect(() => {
    if (initialLayout) {
      setLayout(initialLayout);
    }
  }, [initialLayout]);

  return (
    <Mosaic
      value={layout}
      onChange={setLayout}
      renderTile={(id, path) => {
        let title;
        let Component;
        switch (id) {
          case 'gl':
            title = t('mosaicLayout.generalLedger', 'General Ledger');
            Component = GLInquiry;
            break;
          case 'po':
            title = t('mosaicLayout.purchaseOrders', 'Purchase Orders');
            Component = PurchaseOrders;
            break;
          case 'sales':
            title = t('mosaicLayout.salesDashboard', 'Sales Dashboard');
            Component = TabbedWindows;
            break;
          case 'dashboard':
            title = t('mosaicLayout.dashboard', 'Dashboard');
            Component = SalesDashboard;
            break;
          case 'inventory':
            title = t('mosaicLayout.inventory', 'Inventory');
            Component = Inventory;
            break;
          case 'orders':
            title = t('mosaicLayout.orderEntry', 'Order Entry');
            Component = OrderEntry;
            break;
          case 'acct':
            title = t('mosaicLayout.accounting', 'Accounting');
            Component = Accounting;
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
