import React, { useState, useEffect, useRef } from 'react';
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
  const [uploads, setUploads] = useState([]);
  const [uploadSel, setUploadSel] = useState([]);
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderName, setFolderName] = useState('');
  const fileRef = useRef();

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

  function toggleUpload(id) {
    setUploadSel((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleUploadAll() {
    if (uploadSel.length === uploads.length) {
      setUploadSel([]);
    } else {
      setUploadSel(uploads.map((u) => u.index));
    }
  }

  const PER_PAGE = 100;
  const [tab, setTab] = useState('cleanup');
  const [pending, setPending] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [uploadSel, setUploadSel] = useState([]);
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderName, setFolderName] = useState('');
  const [folderPage, setFolderPage] = useState(1);
  const [folderSel, setFolderSel] = useState([]);
  const fileRef = useRef();

  const startIdx = (folderPage - 1) * PER_PAGE;
  const pageFiles = folderFiles.slice(startIdx, startIdx + PER_PAGE);
  const folderHasMore = startIdx + PER_PAGE < folderFiles.length;

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

  function toggleUpload(id) {
    setUploadSel((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleUploadAll() {
    if (uploadSel.length === uploads.length) {
      setUploadSel([]);
    } else {
      setUploadSel(uploads.map((u) => u.index));
    }
  }

  function toggleFolder(idx) {
    setFolderSel((prev) =>
      prev.includes(idx) ? prev.filter((p) => p !== idx) : [...prev, idx],
    );
  }

  function toggleFolderAll(pageFiles) {
    const ids = pageFiles.map((_, i) => i + (folderPage - 1) * PER_PAGE);
    if (ids.every((id) => folderSel.includes(id))) {
      setFolderSel((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setFolderSel((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }

  function deleteSelected() {
    if (folderSel.length === 0) return;
    const remaining = folderFiles.filter((_, i) => !folderSel.includes(i));
    setFolderFiles(remaining);
    setFolderSel([]);
    setUploads([]);
    setUploadSel([]);
  }

  function clearFolderSelection() {
    setFolderSel([]);
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
    if (tab !== 'fix') {
      setPending([]);
      setUploads([]);
      setUploadSel([]);
      setSelected([]);
      setPage(1);
      setFolderFiles([]);
      setFolderSel([]);
      setFolderPage(1);
      setFolderName('');
    }
  }, [tab]);

  useEffect(() => {
    clearFolderSelection();
  }, [folderPage, folderFiles]);

  async function refreshList(p = page) {
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?page=${p}`, {
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

  async function selectFolder() {
    if (window.showDirectoryPicker) {
      try {
        const dir = await window.showDirectoryPicker();
        const files = [];
        const root = dir.name;
        async function readDir(handle) {
          for await (const entry of handle.values()) {
            if (entry.kind === 'file') {
              const file = await entry.getFile();
              files.push(file);
            } else if (entry.kind === 'directory') {
              await readDir(entry);
            }
          }
        }
        await readDir(dir);
        handleFolderChange(files, root);
        return;
      } catch {
        // cancelled or not allowed
      }
    }
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  }

  function handleFolderChange(files, root) {
    const arr = Array.from(files || []);
    setFolderFiles(arr);
    setFolderPage(1);
    setFolderSel([]);
    if (root) {
      setFolderName(root);
    } else if (arr.length > 0) {
      const rel = arr[0].webkitRelativePath || arr[0].name;
      const dir = rel.split('/').slice(0, -1).join('/') || rel.split('/')[0];
      setFolderName(dir);
    } else {
      setFolderName('');
    }
  }

  async function checkFolder() {
    if (folderFiles.length === 0) return;
    let indices = folderSel;
    if (indices.length === 0) {
      const start = (folderPage - 1) * PER_PAGE;
      const pageFiles = folderFiles.slice(start, start + PER_PAGE);
      indices = pageFiles.map((_, i) => start + i);
    }
    const names = indices.map((i) => ({ name: folderFiles[i].name, index: i }));
    try {
      const res = await fetch('/api/transaction_images/folder_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list: names }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploads(Array.isArray(data.list) ? data.list : []);
        setUploadSel([]);
      } else {
        addToast('Check failed', 'error');
      }
    } catch {
      addToast('Check failed', 'error');
    }
  }

  async function commitUploads() {
    const items = uploads.filter((u) => uploadSel.includes(u.index));
    if (items.length === 0) return;
    const form = new FormData();
    const meta = [];
    items.forEach((it) => {
      form.append('images', folderFiles[it.index]);
      meta.push({ name: folderFiles[it.index].name, newName: it.newName, folder: it.folder });
    });
    form.append('meta', JSON.stringify(meta));
    const res = await fetch('/api/transaction_images/folder_commit', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast(`Uploaded ${data.uploaded || 0} file(s)`, 'success');
      const remaining = folderFiles.filter((_, i) => !uploadSel.includes(i));
      setFolderFiles(remaining);
      setUploads([]);
      setUploadSel([]);
      setFolderSel((sel) => sel.filter((i) => !uploadSel.includes(i)));
    } else {
      addToast('Upload failed', 'error');
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
          <div style={{ marginBottom: '0.5rem' }}>
            <button type="button" onClick={selectFolder} style={{ marginRight: '0.5rem' }}>
              Select Folder
            </button>
            <input
              type="file"
              multiple
              webkitdirectory="true"
              directory="true"
              ref={fileRef}
              style={{ display: 'none' }}
              onChange={(e) => handleFolderChange(e.target.files)}
            />
            <input
              type="text"
              value={folderName}
              readOnly
              placeholder="No folder"
              style={{ marginRight: '0.5rem', width: '12rem' }}
            />
            <button type="button" onClick={checkFolder} style={{ marginRight: '0.5rem' }}>
              Check Folder
            </button>
            <button type="button" onClick={refreshList} style={{ marginRight: '0.5rem' }}>
              Refresh
            </button>
            <button type="button" onClick={deleteSelected} style={{ marginRight: '0.5rem' }} disabled={folderSel.length === 0}>
              Delete Selected
            </button>
            <button type="button" disabled={folderPage === 1} onClick={() => setFolderPage(folderPage - 1)} style={{ marginRight: '0.5rem' }}>
              Prev Page
            </button>
            <button type="button" disabled={!folderHasMore} onClick={() => setFolderPage(folderPage + 1)} style={{ marginRight: '0.5rem' }}>
              Next Page
            </button>
            <button type="button" disabled={page === 1} onClick={() => { const p = page - 1; setPage(p); refreshList(p); }} style={{ marginRight: '0.5rem' }}>
              Prev
            </button>
            <button type="button" disabled={!hasMore} onClick={() => { const p = page + 1; setPage(p); refreshList(p); }}>
              Next
            </button>
          </div>
          {pageFiles.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Local Files</h4>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input type="checkbox" checked={pageFiles.every((_, i) => folderSel.includes(startIdx + i))} onChange={() => toggleFolderAll(pageFiles)} />
                    </th>
                    <th className="border px-2 py-1">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {pageFiles.map((f, idx) => (
                    <tr key={startIdx + idx} className={folderSel.includes(startIdx + idx) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input type="checkbox" checked={folderSel.includes(startIdx + idx)} onChange={() => toggleFolder(startIdx + idx)} />
                      </td>
                      <td className="border px-2 py-1">{f.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {uploads.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Uploads</h4>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input type="checkbox" checked={uploadSel.length === uploads.length && uploads.length > 0} onChange={toggleUploadAll} />
                    </th>
                    <th className="border px-2 py-1">Original</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.index} className={uploadSel.includes(u.index) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input type="checkbox" checked={uploadSel.includes(u.index)} onChange={() => toggleUpload(u.index)} />
                      </td>
                      <td className="border px-2 py-1">{u.originalName}</td>
                      <td className="border px-2 py-1">{u.newName}</td>
                      <td className="border px-2 py-1">{u.folderDisplay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={commitUploads} style={{ marginTop: '0.5rem' }} disabled={uploadSel.length === 0}>
                Rename &amp; Upload Selected
              </button>
            </div>
          )}
          {pending.length === 0 ? (
            <p>No incomplete names found.</p>
          ) : (
            <div>
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
