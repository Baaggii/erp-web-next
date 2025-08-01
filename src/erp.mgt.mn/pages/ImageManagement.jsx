import React, { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import FixImagesTab from '../components/FixImagesTab.jsx';

export default function ImageManagement() {
  const { addToast } = useToast();
  const [days, setDays] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('cleanup');
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

  return (
    <div>
      <h2>Image Management</h2>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={() => setTab('cleanup')}>Cleanup</button>
        <button onClick={() => setTab('fix')} style={{ marginLeft: '0.5rem' }}>
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
          <button
            type="button"
            onClick={handleCleanup}
            style={{ marginLeft: '0.5rem' }}
          >
            Cleanup
          </button>
          {result !== null && (
            <p style={{ marginTop: '0.5rem' }}>{result} file(s) removed.</p>
          )}
        </div>
      )}
      {tab === 'fix' && <FixImagesTab />}
    </div>
  );
}
