import React, { useEffect, useState } from 'react';

export default function AIInventoryDashboard() {
  const [data, setData] = useState({});
  const [error, setError] = useState('');

  async function fetchData() {
    try {
      const res = await fetch('/api/ai_inventory/results', { credentials: 'include' });
      const json = await res.json();
      setData(json);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Failed to load results');
      setData({});
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function confirm(id) {
    await fetch(`/api/ai_inventory/results/${id}/confirm`, {
      method: 'POST',
      credentials: 'include',
    });
    fetchData();
  }

  const entries = Object.entries(data);
  return (
    <div>
      <h2>AI Inventory Results</h2>
      <button onClick={fetchData}>Refresh</button>
      {error && <p className="text-red-600 mt-1">{error}</p>}
      {entries.length === 0 ? (
        <p className="mt-2">No AI inventory results.</p>
      ) : (
        <table className="min-w-full border mt-2 text-sm">
          <thead>
            <tr>
              <th className="border px-2">ID</th>
              <th className="border px-2">Employee</th>
              <th className="border px-2">Items</th>
              <th className="border px-2">Confirmed</th>
              <th className="border px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([id, rec]) => (
              <tr key={id} className="odd:bg-gray-50">
                <td className="border px-2">{id}</td>
                <td className="border px-2">{rec.empid}</td>
                <td className="border px-2">
                  {rec.items.map((it, idx) => (
                    <div key={idx}>{`${it.code} - ${it.qty}`}</div>
                  ))}
                </td>
                <td className="border px-2">{rec.confirmed ? 'Yes' : 'No'}</td>
                <td className="border px-2">
                  {!rec.confirmed && (
                    <button onClick={() => confirm(id)}>Confirm</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
