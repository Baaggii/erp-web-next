import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import buildImageName from '../utils/buildImageName.js';

export default function RowImageUploadModal({
  visible,
  onClose,
  table,
  row = {},
  imagenameFields = [],
  columnCaseMap = {},
  onUploaded = () => {},
}) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  if (!visible) return null;
  function buildName() {
    return buildImageName(row, imagenameFields, columnCaseMap);
  }

  useEffect(() => {
    if (!visible) return;
    const { name } = buildName();
    if (!table || !name) {
      setUploaded([]);
      return;
    }
    fetch(`/api/transaction_images/${table}/${encodeURIComponent(name)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((imgs) => setUploaded(Array.isArray(imgs) ? imgs : []))
      .catch(() => setUploaded([]));
  }, [visible, table, row]);

  async function handleUpload() {
    const { name: safeName, missing } = buildName();
    const uploadUrl = safeName && table ? `/api/transaction_images/${table}/${encodeURIComponent(safeName)}` : '';
    if (!uploadUrl) {
      const msg = missing.length
        ? `Image name is missing fields: ${missing.join(', ')}`
        : 'Image name is missing';
      addToast(msg, 'error');
      return;
    }
    if (!files.length) return;
    setLoading(true);
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: form, credentials: 'include' });
      if (res.ok) {
        addToast(`Images uploaded as ${safeName}`, 'success');
        const imgs = await res.json().catch(() => []);
        setFiles([]);
        setUploaded(imgs);
        onUploaded(safeName);
      } else {
        const text = await res.text();
        addToast(text || 'Failed to upload images', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Error uploading images', 'error');
    }
    setLoading(false);
  }

  async function deleteFile(file) {
    const { name } = buildName();
    if (!table || !name) return;
    try {
      await fetch(
        `/api/transaction_images/${table}/${encodeURIComponent(name)}/${encodeURIComponent(file)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      setUploaded((u) => u.filter((f) => f !== file));
    } catch {}
  }

  async function deleteAll() {
    const { name } = buildName();
    if (!table || !name) return;
    try {
      await fetch(`/api/transaction_images/${table}/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setUploaded([]);
    } catch {}
  }

  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files))}
        />
        <button
          onClick={handleUpload}
          disabled={!files.length || loading}
          style={{ marginLeft: '0.5rem' }}
        >
          {loading ? 'Uploading...' : 'Upload'}
        </button>
      </div>
      {files.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          Selected files:{' '}
          {files.map((f) => f.name).join(', ')}
        </div>
      )}
      {uploaded.length > 0 && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {uploaded.map((src) => {
            const name = src.split('/').pop();
            return (
              <div key={src} style={{ marginBottom: '0.25rem' }}>
                <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
                <button type="button" onClick={() => deleteFile(name)}>Delete</button>
              </div>
            );
          })}
          <button type="button" onClick={deleteAll} style={{ marginTop: '0.5rem' }}>
            Delete All
          </button>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
