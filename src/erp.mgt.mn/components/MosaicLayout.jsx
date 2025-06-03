import { Mosaic } from 'react-mosaic-component';
import GLInquiry from '../windows/GLInquiry.jsx';
import PurchaseOrders from '../windows/PurchaseOrders.jsx';
import SalesDashboard from '../windows/SalesDashboard.jsx';

export default function MosaicLayout() {
  return (
    <Mosaic
      renderTile={(id, path) => {
        switch (id) {
          case 'gl': return <GLInquiry />;
          case 'po': return <PurchaseOrders />;
          case 'sales': return <SalesDashboard />;
        }
      }}
      initialValue={{ direction: 'row', first: 'gl', second: 'po', splitPercentage: 70 }}
    />
  );
}
