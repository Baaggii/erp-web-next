import React, { useState } from 'react';

export default function InventoryImageUpload({ onResult, multiple = false, uploadUrl = '/api/ai_inventory/identify' }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

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
        const data = await res.json();
        results.push(...(data.items || []));
      } catch (err) {
        console.error(err);
      }
    }
    setItems(results);
    if (onResult) onResult({ items: results });
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
