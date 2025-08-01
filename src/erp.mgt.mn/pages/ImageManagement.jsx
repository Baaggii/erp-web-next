import React, { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function ImageManagement() {
  const { addToast } = useToast();
  const [tab, setTab] = useState('cleanup');
  const [days, setDays] = useState('');
  const [result, setResult] = useState(null);

  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(100);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(new Set());
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

  async function fetchList(pg = page, pp = perPage) {
    const params = new URLSearchParams({ page: pg, perPage: pp });
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setList(data.list || []);
      setHasMore(Boolean(data.hasMore));
      setSelected(new Set());
    } catch {
      addToast('Detect failed', 'error');
    }
  }

  function handleDetect() {
    setPage(1);
    fetchList(1, perPage);
  }

  function handlePrev() {
    if (page > 1) {
      const p = page - 1;
      setPage(p);
      fetchList(p, perPage);
    }
  }

  function handleNext() {
    if (hasMore) {
      const p = page + 1;
      setPage(p);
      fetchList(p, perPage);
    }
  }

  function handlePageSize(e) {
    const val = parseInt(e.target.value, 10) || 100;
    setPerPage(val);
    setPage(1);
    fetchList(1, val);
  }

  function toggleSelect(idx) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function handleDelete() {
    setList(list.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  }

  async function handleRename() {
    const items = list.filter((_, i) => selected.has(i));
    if (items.length === 0) return;
    const preview = items.map((it) => `${it.currentName} -> ${it.folder}/${it.newName}`).join('\n');
    if (!window.confirm(`Rename and move the following files?\n${preview}`)) return;
    try {
      const res = await fetch('/api/transaction_images/fix_incomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list: items }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json().catch(() => ({}));
      addToast(`Renamed ${data.fixed || 0} file(s)`, 'success');
      fetchList(page, perPage);
    } catch {
      addToast('Rename failed', 'error');
    }
  }

  return (
    <div>
      <h2>Image Management</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <button
          onClick={() => setTab('cleanup')}
          style={tab === 'cleanup' ? styles.activeTab : styles.tab}
        >
          Cleanup
        </button>
        <button
          onClick={() => setTab('fix')}
          style={tab === 'fix' ? styles.activeTab : styles.tab}
        >
          Fix Images
        </button>
      </div>
      {tab === 'cleanup' && (
        <div style={{ marginBottom: '1rem' }}>
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
          {result !== null && <p>{result} file(s) removed.</p>}
        </div>
      )}
      {tab === 'fix' && (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleDetect}>Detect from host</button>
            <label style={{ marginLeft: '1rem' }}>
              Page Size:{' '}
              <input
                type="number"
                value={perPage}
                onChange={handlePageSize}
                style={{ width: '4rem' }}
              />
            </label>
            <button onClick={handlePrev} disabled={page <= 1} style={{ marginLeft: '0.5rem' }}>
              Previous
            </button>
            <button onClick={handleNext} disabled={!hasMore} style={{ marginLeft: '0.5rem' }}>
              Next
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0}
              style={{ marginLeft: '0.5rem' }}
            >
              Delete
            </button>
            <button
              onClick={handleRename}
              disabled={selected.size === 0}
              style={{ marginLeft: '0.5rem' }}
            >
              Rename
            </button>
          </div>
          {list.length === 0 ? (
            <p>No files.</p>
          ) : (
            <div className="table-container overflow-x-auto" style={{ maxHeight: '70vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e5e7eb' }}>
                    <th style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}></th>
                    <th style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>Current</th>
                    <th style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>New Name</th>
                    <th style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>Folder</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '0.25rem', border: '1px solid #d1d5db', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(idx)}
                          onChange={() => toggleSelect(idx)}
                        />
                      </td>
                      <td style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>{item.currentName}</td>
                      <td style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>{item.newName}</td>
                      <td style={{ padding: '0.25rem', border: '1px solid #d1d5db' }}>{item.folderDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  tab: {
    padding: '0.25rem 0.5rem',
    cursor: 'pointer',
    backgroundColor: '#d1d5db',
    border: '1px solid #9ca3af',
    marginRight: '0.25rem',
  },
  activeTab: {
    padding: '0.25rem 0.5rem',
    cursor: 'pointer',
    backgroundColor: '#ffffff',
    border: '1px solid #9ca3af',
    marginRight: '0.25rem',
    borderBottom: 'none',
  },
};
