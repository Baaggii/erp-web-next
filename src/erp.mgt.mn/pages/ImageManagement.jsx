import React, { useState, useRef, useEffect } from 'react';
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
  const [folderName, setFolderName] = useState('');
  const [uploadSummary, setUploadSummary] = useState(null);
  const [pendingSummary, setPendingSummary] = useState(null);
  const [pageSize, setPageSize] = useState(100);
  const detectAbortRef = useRef();
  const folderAbortRef = useRef();
  const scanCancelRef = useRef(false);
  const [activeOp, setActiveOp] = useState(null);

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
      setUploadSel(uploads.map((u) => u.tmpPath));
    }
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && activeOp) {
        const action = activeOp === 'detect' ? 'detection' : 'folder selection';
        if (window.confirm(`Cancel ${action}?`)) {
          if (activeOp === 'detect') {
            detectAbortRef.current?.abort();
          } else {
            scanCancelRef.current = true;
            folderAbortRef.current?.abort();
          }
          setActiveOp(null);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeOp]);

  async function selectFolder() {
    if (!window.showDirectoryPicker) {
      addToast('Directory selection not supported', 'error');
      return;
    }
    setActiveOp('folder');
    scanCancelRef.current = false;
    try {
      const dirHandle = await window.showDirectoryPicker();
      const arr = [];
      for await (const entry of dirHandle.values()) {
        if (scanCancelRef.current) break;
        if (entry.kind === 'file') {
          arr.push(await entry.getFile());
        }
      }
      if (scanCancelRef.current) return;
      setFolderName(dirHandle.name || '');
      await handleSelectFiles(arr);
    } catch {
      // ignore
    } finally {
      folderAbortRef.current = null;
      scanCancelRef.current = false;
      setActiveOp(null);
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

  async function detectFromHost(p = page, s = pageSize) {
    const controller = new AbortController();
    detectAbortRef.current = controller;
    setActiveOp('detect');
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?page=${p}&pageSize=${s}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setPending(Array.isArray(data.list) ? data.list : []);
        setPendingSummary(data.summary || null);
        setHasMore(!!data.hasMore);
        setSelected([]);
      } else {
        setPending([]);
        setPendingSummary(null);
        setHasMore(false);
      }
      setPage(p);
      setPageSize(s);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setPending([]);
        setPendingSummary(null);
        setHasMore(false);
      }
    } finally {
      detectAbortRef.current = null;
      setActiveOp(null);
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
      detectFromHost(page);
    } else {
      addToast('Rename failed', 'error');
    }
  }

  async function handleSelectFiles(files) {
    if (!files?.length) return;
    const arr = Array.from(files);
    const first = arr[0];
    if (first?.webkitRelativePath) {
      const parts = first.webkitRelativePath.split('/');
      setFolderName(parts[0] || '');
    }
    const form = new FormData();
    arr.slice(0, 1000).forEach((f) => form.append('images', f));
    try {
      const controller = new AbortController();
      folderAbortRef.current = controller;
      const res = await fetch('/api/transaction_images/upload_check', {
        method: 'POST',
        body: form,
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setUploads(Array.isArray(data.list) ? data.list : []);
        setUploadSummary(data.summary || null);
        setUploadSel([]);
      } else {
        addToast('Check failed', 'error');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        addToast('Check failed', 'error');
      }
    }
  }

  async function commitUploads() {
    const items = uploads.filter((u) => uploadSel.includes(u.tmpPath));
    if (items.length === 0) return;
    const res = await fetch('/api/transaction_images/upload_commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ list: items }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast(`Uploaded ${data.uploaded || 0} file(s)`, 'success');
      setUploads([]);
      setUploadSel([]);
      setUploadSummary(null);
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
            {folderName && <span style={{ marginRight: '0.5rem' }}>{folderName}</span>}
          </div>
          {uploadSummary && (
            <p style={{ marginBottom: '0.5rem' }}>
              {`Scanned ${uploadSummary.totalFiles || 0} file(s), processed ${uploadSummary.processed || 0}.`}
            </p>
          )}
          {uploads.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Uploads</h4>
              <button
                type="button"
                onClick={commitUploads}
                style={{ marginBottom: '0.5rem' }}
                disabled={uploadSel.length === 0}
              >
                Rename &amp; Upload Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploads((prev) => prev.filter((u) => !uploadSel.includes(u.tmpPath)));
                  setUploadSel([]);
                }}
                style={{ marginBottom: '0.5rem', marginLeft: '0.5rem' }}
                disabled={uploadSel.length === 0}
              >
                Delete Selected
              </button>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input type="checkbox" checked={uploadSel.length === uploads.length && uploads.length > 0} onChange={toggleUploadAll} />
                    </th>
                    <th className="border px-2 py-1">Original</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                    <th className="border px-2 py-1">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.tmpPath} className={uploadSel.includes(u.tmpPath) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input type="checkbox" checked={uploadSel.includes(u.tmpPath)} onChange={() => toggleUpload(u.tmpPath)} />
                      </td>
                      <td className="border px-2 py-1">{u.originalName}</td>
                      <td className="border px-2 py-1">{u.newName}</td>
                      <td className="border px-2 py-1">{u.folderDisplay}</td>
                      <td className="border px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setUploads((prev) => prev.filter((x) => x.tmpPath !== u.tmpPath));
                            setUploadSel((s) => s.filter((id) => id !== u.tmpPath));
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginBottom: '0.5rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => detectFromHost(1)} style={{ marginRight: '0.5rem' }}>
              Detect from host
            </button>
            <label style={{ marginRight: '0.5rem' }}>
              Page Size:{' '}
              <select
                value={pageSize}
                onChange={(e) => detectFromHost(1, Number(e.target.value))}
              >
                {[50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => detectFromHost(page - 1)}
              style={{ marginRight: '0.5rem' }}
            >
              Prev
            </button>
            <button type="button" disabled={!hasMore} onClick={() => detectFromHost(page + 1)}>
              Next
            </button>
          </div>
          {pendingSummary && (
            <p style={{ marginBottom: '0.5rem' }}>
              {`Scanned ${pendingSummary.totalFiles || 0} file(s) in ${pendingSummary.folders?.length || 0} folder(s)`}
              {pendingSummary.folders?.length ? ` (${pendingSummary.folders.join(', ')})` : ''}
              {`. Found ${pendingSummary.incompleteFound || 0} incomplete name(s), displaying ${pendingSummary.processed || 0}.`}
            </p>
          )}
          {pending.length === 0 ? (
            <p>No incomplete names found.</p>
          ) : (
            <div>
              <button
                type="button"
                onClick={applyFixes}
                style={{ marginBottom: '0.5rem' }}
                disabled={selected.length === 0}
              >
                Rename &amp; Move Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending((prev) => prev.filter((p) => !selected.includes(p.currentName)));
                  setSelected([]);
                }}
                style={{ marginBottom: '0.5rem', marginLeft: '0.5rem' }}
                disabled={selected.length === 0}
              >
                Delete Selected
              </button>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input type="checkbox" checked={selected.length === pending.length && pending.length > 0} onChange={toggleAll} />
                    </th>
                    <th className="border px-2 py-1">Current</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                    <th className="border px-2 py-1">Delete</th>
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
                      <td className="border px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setPending((prev) => prev.filter((x) => x.currentName !== p.currentName));
                            setSelected((s) => s.filter((id) => id !== p.currentName));
                          }}
                        >
                          Delete
                        </button>
                      </td>
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
