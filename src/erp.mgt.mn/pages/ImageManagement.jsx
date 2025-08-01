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
  const [uploadPage, setUploadPage] = useState(1);
  const [uploadPageSize, setUploadPageSize] = useState(200);
  const [folderName, setFolderName] = useState('');
  const [uploadSummary, setUploadSummary] = useState(null);
  const [pendingSummary, setPendingSummary] = useState(null);
  const [pageSize, setPageSize] = useState(200);
  const detectAbortRef = useRef();
  const scanCancelRef = useRef(false);
  const [activeOp, setActiveOp] = useState(null);

  const uploadStart = (uploadPage - 1) * uploadPageSize;
  const pageUploads = uploads.slice(uploadStart, uploadStart + uploadPageSize);
  const uploadHasMore = uploadStart + uploadPageSize < uploads.length;

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

  function toggleUploadAll(list) {
    const ids = list.map((u) => u.id);
    const allSelected = ids.every((id) => uploadSel.includes(id));
    if (allSelected) {
      setUploadSel((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setUploadSel((prev) => [...prev, ...ids.filter((id) => !prev.includes(id))]);
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
      const handles = {};
      const names = [];
      for await (const entry of dirHandle.values()) {
        if (scanCancelRef.current) break;
        if (entry.kind === 'file') {
          names.push(entry.name);
          handles[entry.name] = entry;
        }
      }
      if (scanCancelRef.current) return;
      const chunkSize = 200;
      let all = [];
      let processed = 0;
      for (let i = 0; i < names.length; i += chunkSize) {
        if (scanCancelRef.current) return;
        let res;
        try {
          res = await fetch('/api/transaction_images/upload_scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ names: names.slice(i, i + chunkSize) }),
          });
        } catch {
          addToast('Folder scan failed', 'error');
          return;
        }
        if (!res.ok) {
          addToast('Folder scan failed', 'error');
          return;
        }
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.list) ? data.list : [];
        processed += data?.summary?.processed || 0;
        all = all.concat(list);
      }
      if (scanCancelRef.current) return;
      setFolderName(dirHandle.name || '');
      setUploads(
        all.map((u) => ({ originalName: u.originalName, id: u.originalName, handle: handles[u.originalName] }))
      );
      setUploadSummary({ totalFiles: names.length, processed });
      setUploadSel([]);
      setUploadPage(1);
    } catch {
      // ignore
    } finally {
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

  async function detectFromHost(p = page) {
    const controller = new AbortController();
    detectAbortRef.current = controller;
    setActiveOp('detect');
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?page=${p}&pageSize=${pageSize}`, {
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
    setPage(p);
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

  async function renameSelected() {
    const items = uploads.filter((u) => uploadSel.includes(u.id) && u.handle && !u.tmpPath);
    if (items.length === 0) return;
    const formData = new FormData();
    try {
      for (const u of items) {
        const file = await u.handle.getFile();
        formData.append('images', file, u.originalName);
      }
    } catch {
      addToast('Rename failed', 'error');
      return;
    }
    try {
      const res = await fetch('/api/transaction_images/upload_check', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        addToast('Rename failed', 'error');
        return;
      }
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.list) ? data.list : [];
      setUploads((prev) =>
        prev.map((u) => {
          const found = list.find((x) => x.originalName === u.originalName);
          return found ? { ...u, ...found, id: u.id } : u;
        }),
      );
    } catch {
      addToast('Rename failed', 'error');
    }
  }

  async function commitUploads() {
    const items = uploads.filter((u) => uploadSel.includes(u.id) && u.tmpPath);
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
              {`Scanned ${uploadSummary.totalFiles || 0} file(s), found ${uploadSummary.processed || 0} incomplete name(s).`}
            </p>
          )}
          {uploads.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Uploads</h4>
              <button
                type="button"
                onClick={renameSelected}
                style={{ marginBottom: '0.5rem', marginRight: '0.5rem' }}
                disabled={uploadSel.length === 0}
              >
                Rename Selected
              </button>
              <button
                type="button"
                onClick={commitUploads}
                style={{ marginBottom: '0.5rem' }}
                disabled={
                  uploadSel.length === 0 ||
                  !uploads.some((u) => uploadSel.includes(u.id) && u.tmpPath)
                }
              >
                Upload Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploads((prev) => prev.filter((u) => !uploadSel.includes(u.id)));
                  setUploadSel([]);
                }}
                style={{ marginBottom: '0.5rem', marginLeft: '0.5rem' }}
                disabled={uploadSel.length === 0}
              >
                Delete Selected
              </button>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ marginRight: '0.5rem' }}>
                  Page Size:{' '}
                  <input
                    type="number"
                    value={uploadPageSize}
                    onChange={(e) => {
                      setUploadPageSize(Number(e.target.value));
                      setUploadPage(1);
                    }}
                    style={{ width: '4rem' }}
                  />
                </label>
                <button
                  type="button"
                  disabled={uploadPage === 1}
                  onClick={() => setUploadPage(uploadPage - 1)}
                  style={{ marginRight: '0.5rem' }}
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!uploadHasMore}
                  onClick={() => setUploadPage(uploadPage + 1)}
                >
                  Next
                </button>
              </div>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input
                        type="checkbox"
                        checked={pageUploads.length > 0 && pageUploads.every((u) => uploadSel.includes(u.id))}
                        onChange={() => toggleUploadAll(pageUploads)}
                      />
                    </th>
                    <th className="border px-2 py-1">Original</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                    <th className="border px-2 py-1">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {pageUploads.map((u) => (
                    <tr key={u.id} className={uploadSel.includes(u.id) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input type="checkbox" checked={uploadSel.includes(u.id)} onChange={() => toggleUpload(u.id)} />
                      </td>
                      <td className="border px-2 py-1">{u.originalName}</td>
                      <td className="border px-2 py-1">{u.newName}</td>
                      <td className="border px-2 py-1">{u.folderDisplay}</td>
                      <td className="border px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setUploads((prev) => prev.filter((x) => x.id !== u.id));
                            setUploadSel((s) => s.filter((id) => id !== u.id));
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
              <input
                type="number"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ width: '4rem' }}
              />
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
