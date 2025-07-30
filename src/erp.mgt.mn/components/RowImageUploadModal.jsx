import React, { useState, useEffect, useRef } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import buildImageName from '../utils/buildImageName.js';
import buildFolderName from '../utils/buildFolderName.js';

export default function RowImageUploadModal({
  visible,
  onClose,
  table,
  row = {},
  imagenameFields = [],
  imageFolderFields = [],
  columnCaseMap = {},
  onUploaded = () => {},
}) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState([]);
  const tempNameRef = useRef(row._tmpImageName || null);

  function genTempName() {
    const rand = Math.random().toString(36).slice(2);
    try {
      if (typeof globalThis !== 'undefined') {
        const c = globalThis.crypto;
        if (c && c.randomUUID) return c.randomUUID();
      }
    } catch {
      /* ignore */
    }
    return Date.now().toString(36) + rand;
  }

  if (!tempNameRef.current) {
    tempNameRef.current = genTempName();
  }
  if (!visible) return null;
  function buildName() {
    const res = buildImageName(row, imagenameFields, columnCaseMap);
    if (!res.name || res.missing.length) {
      return { name: tempNameRef.current, missing: [], temp: true };
    }
    return res;
  }
  function buildFolder() {
    return buildFolderName(row, imageFolderFields, columnCaseMap);
  }

  async function handleUpload() {
    const { name: folder } = buildFolder();
    const { name: safeName } = buildName();
    if (!table || !safeName) return;
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
    const uploadUrl =
      safeName && table
        ? `/api/transaction_images/${table}/${encodeURIComponent(safeName)}${query}`
        : '';
    if (!files.length) return;
    setLoading(true);
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: form, credentials: 'include' });
      if (res.ok) {
        addToast('Images uploaded', 'success');
        setFiles([]);
        fetchImages();
        onUploaded(safeName, folder);
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

  async function fetchImages() {
    const { name: folder } = buildFolder();
    const { name: safeName } = buildName();
    if (!table || !safeName) {
      setImages([]);
      return;
    }
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
    const res = await fetch(
      `/api/transaction_images/${table}/${encodeURIComponent(safeName)}${query}`,
      { credentials: 'include' },
    );
    const data = await res.json().catch(() => []);
    setImages(Array.isArray(data) ? data : []);
  }

  async function handleDelete(url) {
    const { name: folder } = buildFolder();
    const { name: safeName } = buildName();
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (url) params.set('file', url);
    await fetch(
      `/api/transaction_images/${table}/${encodeURIComponent(safeName)}?${params.toString()}`,
      { method: 'DELETE', credentials: 'include' },
    );
    fetchImages();
  }

  useEffect(() => {
    if (visible) fetchImages();
  }, [visible]);

  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
      <button type="button" onClick={handleUpload} disabled={!files.length || loading} style={{ marginLeft: '0.5rem' }}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>
      {images.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <h4>Uploaded Images</h4>
          {images.map((src, idx) => (
            <div key={idx} style={{ marginBottom: '0.5rem' }}>
              <img src={src} alt="" style={{ maxWidth: '100%' }} />
              <button type="button" onClick={() => handleDelete(src)} style={{ marginLeft: '0.5rem' }}>
                Delete
              </button>
            </div>
          ))}
          <button type="button" onClick={() => handleDelete()}>Delete All</button>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
