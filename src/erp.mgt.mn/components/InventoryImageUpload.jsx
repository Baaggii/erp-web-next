import React, { useState } from 'react';

export default function InventoryImageUpload({ onResult }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await fetch('/api/ai_inventory/identify', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await res.json();
      setItems(data.items || []);
      if (onResult) onResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleUpload} disabled={!file || loading}>
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
