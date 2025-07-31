import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function ImageManagement() {
  const { addToast } = useToast();
  const [days, setDays] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('cleanup');
  const [pending, setPending] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState([]);

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (selected.length === pending.length) {
      setSelected([]);
    } else {
      setSelected(pending.map((p) => p.currentName));
    }
  }

  async function handleCleanup() {
    const path = days ? `/api/transaction_images/cleanup/${days}` : '/api/transaction_images/cleanup';
    try {
      const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const removed = data.removed || 0;
        setResult(removed);
        addToast(`Removed ${removed} file(s)`, 'success');
      } else {
        addToast('Cleanup failed', 'error');
      }
    } catch {
      addToast('Cleanup failed', 'error');
    }
  }

  useEffect(() => {
    if (tab !== 'fix') return;
    refreshList();
  }, [tab, page]);

  async function refreshList() {
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?page=${page}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setPending(Array.isArray(data.list) ? data.list : []);
        setHasMore(!!data.hasMore);
        setSelected([]);
      } else {
        setPending([]);
        setHasMore(false);
      }
    } catch {
      setPending([]);
      setHasMore(false);
    }
  }

  async function applyFixes() {
    const items = pending.filter((p) => selected.includes(p.currentName));
    if (items.length === 0) return;
    const res = await fetch('/api/transaction_images/fix_incomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ list: items }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast(`Renamed ${data.fixed || 0} file(s)`, 'success');
      refreshList();
    } else {
      addToast('Rename failed', 'error');
    }
  }

  return (
    <div>
      <h2>Image Management</h2>
      <div className="tab-button-group" style={{ marginBottom: '0.5rem' }}>
        <button className={`tab-button ${tab === 'cleanup' ? 'active' : ''}`} onClick={() => setTab('cleanup')}>
          Cleanup
        </button>
        <button className={`tab-button ${tab === 'fix' ? 'active' : ''}`} onClick={() => setTab('fix')}>
          Fix Names
        </button>
      </div>
      {tab === 'cleanup' ? (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Cleanup files older than (days):{' '}
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                style={{ width: '4rem' }}
              />
            </label>
            <button type="button" onClick={handleCleanup} style={{ marginLeft: '0.5rem' }}>
              Cleanup
            </button>
          </div>
          {result !== null && <p>{result} file(s) removed.</p>}
        </div>
      ) : (
        <div>
          {pending.length === 0 ? (
            <p>No incomplete names found.</p>
          ) : (
            <div>
              <div style={{ marginBottom: '0.5rem' }}>
                <button type="button" onClick={refreshList} style={{ marginRight: '0.5rem' }}>
                  Refresh
                </button>
                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)} style={{ marginRight: '0.5rem' }}>
                  Prev
                </button>
                <button type="button" disabled={!hasMore} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input type="checkbox" checked={selected.length === pending.length && pending.length > 0} onChange={toggleAll} />
                    </th>
                    <th className="border px-2 py-1">Current</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.currentName} className={selected.includes(p.currentName) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input type="checkbox" checked={selected.includes(p.currentName)} onChange={() => toggle(p.currentName)} />
                      </td>
                      <td className="border px-2 py-1">{p.currentName}</td>
                      <td className="border px-2 py-1">{p.newName}</td>
                      <td className="border px-2 py-1">{p.folderDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={applyFixes} style={{ marginTop: '0.5rem' }} disabled={selected.length === 0}>
                Rename &amp; Move Selected
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
