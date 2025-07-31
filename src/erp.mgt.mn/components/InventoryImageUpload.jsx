import React, { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function InventoryImageUpload({ onResult, multiple = false, uploadUrl = '/api/ai_inventory/identify' }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const { addToast } = useToast();

  async function handleUpload() {
    if (!files.length) return;
    setLoading(true);
    const results = [];
    for (const f of files) {
      const form = new FormData();
      form.append('image', f);
      try {
        const res = await fetch(uploadUrl, {
          method: 'POST',
          body: form,
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data.items) ? data.items : [];
          const count = items.length;
          if (count) {
            const list = items
              .map((it) => `${it.code}${it.qty ? ` x${it.qty}` : ''}`)
              .join(', ');
            addToast(`${f.name}: ${count} suggestion(s) - ${list}`, 'success');
            results.push(...items);
          } else {
            addToast(`${f.name}: no suggestions`, 'warn');
          }
        } else {
          const text = await res.text();
          addToast(`${f.name}: ${text || 'AI detection failed'}`, 'error');
        }
      } catch (err) {
        console.error(err);
        addToast(`${f.name}: AI detection error: ${err.message}`, 'error');
      }
    }
    setItems(results);
    if (onResult) onResult({ items: results });
    if (results.length === 0) {
      addToast('No suggestions found', 'warn');
    } else {
      addToast(`Detected ${results.length} item(s)`, 'success');
    }
    setLoading(false);
  }

  return (
    <div>
      <input
        type="file"
        onChange={(e) => setFiles(Array.from(e.target.files))}
        multiple={multiple}
      />
      <button onClick={handleUpload} disabled={!files.length || loading}>
        {loading ? 'Processing...' : 'Upload'}
      </button>
      {items.length > 0 && (
        <ul>
          {items.map((it, idx) => (
            <li key={idx}>{`${it.code} - ${it.qty}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
