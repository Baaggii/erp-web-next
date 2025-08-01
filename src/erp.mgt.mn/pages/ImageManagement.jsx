import React, { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function ImageManagement() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('cleanup');
  const [days, setDays] = useState('');
  const [result, setResult] = useState(null);

  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState([]);
  const [detectResult, setDetectResult] = useState(null);
  async function handleCleanup() {
    const path = days
      ? `/api/transaction_images/cleanup/${days}`
      : '/api/transaction_images/cleanup';
    try {
      const res = await fetch(path, {
        method: 'DELETE',
        credentials: 'include',
      });
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

  async function handleDetect(pg = 1) {
    try {
      const res = await fetch(
        `/api/transaction_images/detect_incomplete?page=${pg}`,
        { credentials: 'include' },
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setList(data.list || []);
        setHasMore(!!data.hasMore);
        setPage(pg);
        setSelected([]);
        const found = data.found || (data.list || []).length;
        const scanned = data.scanned || 0;
        const folder = data.folder || '';
        setDetectResult({ found, scanned, folder });
        addToast(
          `Scanned ${scanned} file(s) in ${folder}. Found ${found} incomplete file(s)`,
          'success',
        );
      } else {
        setDetectResult(null);
        addToast('Detect failed', 'error');
      }
    } catch {
      setDetectResult(null);
      addToast('Detect failed', 'error');
    }
  }

  function toggle(idx, checked) {
    setSelected((cur) => {
      if (checked) return [...cur, idx];
      return cur.filter((i) => i !== idx);
    });
  }

  async function handleFixSelected() {
    const items = selected.map((i) => list[i]);
    if (items.length === 0) return;
    try {
      const res = await fetch('/api/transaction_images/fix_incomplete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: items }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const fixed = data.fixed || 0;
        addToast(`Renamed ${fixed} file(s)`, 'success');
        handleDetect(page);
      } else {
        addToast('Rename failed', 'error');
      }
    } catch {
      addToast('Rename failed', 'error');
    }
  }

  async function handleDeleteSelected() {
    const items = selected.map((i) => list[i]);
    if (items.length === 0) return;
    try {
      const res = await fetch('/api/transaction_images/delete_incomplete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: items }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const deleted = data.deleted || 0;
        addToast(`Deleted ${deleted} file(s)`, 'success');
        handleDetect(page);
      } else {
        addToast('Delete failed', 'error');
      }
    } catch {
      addToast('Delete failed', 'error');
    }
  }

  return (
    <div>
      <h2>Image Management</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('cleanup')}
          style={activeTab === 'cleanup' ? styles.activeTab : styles.tab}
        >
          Cleanup
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fix')}
          style={activeTab === 'fix' ? styles.activeTab : styles.tab}
        >
          Fix Images
        </button>
      </div>

      {activeTab === 'cleanup' && (
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
            <button
              type="button"
              onClick={handleCleanup}
              style={{ marginLeft: '0.5rem' }}
            >
              Cleanup
            </button>
          </div>
          {result !== null && <p>{result} file(s) removed.</p>}
        </div>
      )}

      {activeTab === 'fix' && (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button type="button" onClick={() => handleDetect(1)}>
              Detect from host
            </button>
            {list.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleFixSelected}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Rename &amp; Move Selected
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Delete Selected
                </button>
              </>
            )}
          </div>
          {detectResult && (
            <p style={{ marginTop: '0.5rem' }}>
              Scanned {detectResult.scanned} file(s) in {detectResult.folder}. Found{' '}
              {detectResult.found} incomplete file(s).
            </p>
          )}

          {list.length > 0 && (
            <table style={{ width: '100%', marginBottom: '0.5rem' }}>
              <thead>
                <tr>
                  <th />
                  <th>Current Name</th>
                  <th>New Name</th>
                  <th>Folder</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(idx)}
                        onChange={(e) => toggle(idx, e.target.checked)}
                      />
                    </td>
                    <td>{item.currentName}</td>
                    <td>{item.newName}</td>
                    <td>{item.folderDisplay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {list.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => handleDetect(page - 1)}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span style={{ margin: '0 0.5rem' }}>Page {page} (100 per page)</span>
              <button
                type="button"
                onClick={() => handleDetect(page + 1)}
                disabled={!hasMore}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  tab: {
    background: 'transparent',
    border: '1px solid #ccc',
    padding: '0.25rem 0.5rem',
    marginRight: '0.25rem',
    cursor: 'pointer',
  },
  activeTab: {
    background: '#e5e7eb',
    border: '1px solid #ccc',
    borderBottom: 'none',
    padding: '0.25rem 0.5rem',
    marginRight: '0.25rem',
    cursor: 'pointer',
  },
};
