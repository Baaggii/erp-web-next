import React, { useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';

export default function FixImagesTab() {
  const { addToast } = useToast();
  const [mode, setMode] = useState(null); // 'host' or 'local'
  const [page, setPage] = useState(1);
  const [list, setList] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const pageSize = 100;

  function clearAll() {
    setList([]);
    setHasMore(false);
    setSelected(new Set());
  }

  async function detectHost(p = 1) {
    setMode('host');
    setPage(p);
    clearAll();
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?page=${p}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data.list) ? data.list : []);
        setHasMore(!!data.hasMore);
      } else {
        addToast('Host detection failed', 'error');
      }
    } catch {
      addToast('Host detection failed', 'error');
    }
  }

  async function detectLocal(fileList) {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setMode('local');
    setPage(1);
    setFiles(arr);
    clearAll();
    const meta = arr.map((f, idx) => ({ name: f.name, index: idx }));
    try {
      const res = await fetch('/api/transaction_images/folder_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list: meta }),
      });
      if (res.ok) {
        const data = await res.json();
        setList(Array.isArray(data.list) ? data.list : []);
        setHasMore(arr.length > pageSize);
      } else {
        addToast('Local detection failed', 'error');
      }
    } catch {
      addToast('Local detection failed', 'error');
    }
  }

  function toggle(index) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(index)) n.delete(index);
      else n.add(index);
      return n;
    });
  }

  function toggleAll(checked, display) {
    setSelected((s) => {
      const n = new Set(s);
      if (checked) display.forEach((_, idx) => n.add(idx + (page - 1) * pageSize));
      else display.forEach((_, idx) => n.delete(idx + (page - 1) * pageSize));
      return n;
    });
  }

  async function fixSelected() {
    const items = Array.from(selected).map((i) => list[i]);
    if (!items.length) return;
    if (mode === 'host') {
      try {
        const res = await fetch('/api/transaction_images/fix_incomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ list: items }),
        });
        if (res.ok) {
          const data = await res.json();
          addToast(`Renamed ${data.fixed} file(s)`, 'success');
          detectHost(page);
        } else {
          addToast('Rename failed', 'error');
        }
      } catch {
        addToast('Rename failed', 'error');
      }
    } else if (mode === 'local') {
      const form = new FormData();
      const meta = [];
      Array.from(selected).forEach((i) => {
        const item = list[i];
        const file = files[item.index];
        if (file) form.append('images', file);
        meta.push({ name: item.originalName, newName: item.newName, folder: item.folder });
      });
      form.append('meta', JSON.stringify(meta));
      try {
        const res = await fetch('/api/transaction_images/folder_commit', {
          method: 'POST',
          credentials: 'include',
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          addToast(`Uploaded ${data.uploaded} file(s)`, 'success');
        } else {
          addToast('Upload failed', 'error');
        }
      } catch {
        addToast('Upload failed', 'error');
      }
    }
  }

  const display = mode === 'local'
    ? list.slice((page - 1) * pageSize, page * pageSize)
    : list;
  const allSelected = display.length > 0 && display.every((_, idx) => selected.has(idx + (page - 1) * pageSize));

  return (
    <div>
      <div style={{ marginBottom: '0.5rem' }}>
        <button onClick={() => detectHost(1)}>Detect from Host</button>
        <label style={{ marginLeft: '0.5rem' }}>
          <input
            type="file"
            style={{ display: 'none' }}
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={(e) => detectLocal(e.target.files)}
          />
          <span style={{ border: '1px solid #d1d5db', padding: '0.25rem', cursor: 'pointer' }}>Detect from Local</span>
        </label>
        {mode === 'host' && (
          <button onClick={fixSelected} style={{ marginLeft: '0.5rem' }}>
            Rename &amp; Move Selected
          </button>
        )}
        {mode === 'local' && (
          <button onClick={fixSelected} style={{ marginLeft: '0.5rem' }}>
            Rename &amp; Upload Selected
          </button>
        )}
      </div>
      {display.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked, display)}
                />
              </th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Current</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Name Suggestion</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Move</th>
              <th style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {display.map((item, idx) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(idx + (page - 1) * pageSize)}
                    onChange={() => toggle(idx + (page - 1) * pageSize)}
                  />
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                  {item.currentName || item.originalName}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>{item.newName}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>{item.folderDisplay}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>
                  <button onClick={() => {
                    const index = idx + (page - 1) * pageSize;
                    setList((l) => l.filter((_, i) => i !== index));
                    setSelected((s) => { const n = new Set(s); n.delete(index); return n; });
                  }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {display.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <button onClick={() => { if (page > 1) setPage(page - 1); }} disabled={page === 1}>
            Previous
          </button>
          <button
            onClick={() => {
              if (mode === 'host') detectHost(page + 1); else setPage(page + 1);
            }}
            disabled={mode === 'host' ? !hasMore : page * pageSize >= list.length}
            style={{ marginLeft: '0.5rem' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
