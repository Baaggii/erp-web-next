import React, { useEffect } from 'react';

const data = [
  { id: 1, name: 'Бараа 1', qty: 10, price: 1000 },
  { id: 2, name: 'Бараа 2', qty: 5, price: 2000 },
  { id: 3, name: 'Бараа 3', qty: 8, price: 1500 },
];

export default function InventoryPage() {
  useEffect(() => {
    if (window.erpDebug) console.warn('Mounted: InventoryPage');
  }, []);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border text-sm bg-white max-h-[70vh] overflow-auto">
        <thead className="sticky top-0 bg-white z-10">
          <tr>
            <th className="px-4 py-2 border-b">#</th>
            <th className="px-4 py-2 border-b">Нэр</th>
            <th className="px-4 py-2 border-b">Тоо</th>
            <th className="px-4 py-2 border-b">Үнэ</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="odd:bg-gray-50">
              <td className="px-4 py-2 border-b whitespace-nowrap">{row.id}</td>
              <td className="px-4 py-2 border-b whitespace-nowrap">{row.name}</td>
              <td className="px-4 py-2 border-b whitespace-nowrap text-right">{row.qty}</td>
              <td className="px-4 py-2 border-b whitespace-nowrap text-right">{row.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
