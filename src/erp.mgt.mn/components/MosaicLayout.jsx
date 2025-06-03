import { Mosaic, MosaicWindow } from 'react-mosaic-component';
import 'react-mosaic-component/react-mosaic-component.css';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';

export default function MosaicLayout() {
  return (
    <Mosaic
      className="mosaic-blueprint-theme"
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
          <MosaicWindow title={title} path={path} toolbarControls={null}>
            <Component />
          </MosaicWindow>
        );
      }}
      initialValue={{ direction: 'row', first: 'gl', second: 'po', splitPercentage: 70 }}
    />
  );
}
