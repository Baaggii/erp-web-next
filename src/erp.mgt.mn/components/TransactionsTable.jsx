import React, { useEffect, useState } from 'react';
import Spinner from './Spinner.jsx';

export default function TransactionsTable({ branchId, type = '', date = '', perPage = 10 }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [branchId, type, date, perPage]);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (branchId !== undefined) params.set('branch', branchId);
      if (type) params.set('type', type);
      if (date) params.set('date', date);
      params.set('page', page);
      params.set('perPage', perPage);
      try {
        const res = await fetch(`/api/transactions?${params.toString()}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (!canceled) {
          setRows(Array.isArray(data.rows) ? data.rows : []);
          setTotal(data.totalCount || 0);
        }
      } catch {
        if (!canceled) {
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => {
      canceled = true;
    };
  }, [branchId, type, date, page, perPage]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div style={{ position: 'relative' }}>
      {loading && <Spinner />}
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm bg-white">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              {rows[0] &&
                Object.keys(rows[0]).map((col) => (
                  <th key={col} className="px-4 py-2 border-b whitespace-nowrap">
                    {col}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="odd:bg-gray-50">
                {Object.keys(row).map((col) => (
                  <td key={col} className="px-4 py-2 border-b whitespace-nowrap">
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td
                  className="px-4 py-2 border-b text-center"
                  colSpan={rows[0] ? Object.keys(rows[0]).length : 1}
                >
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center items-center space-x-2 mt-2">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Prev
        </button>
        <span>
          {page}/{totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}
