import React, { useState } from 'react';
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
  if (!visible) return null;
  function buildName() {
    return buildImageName(row, imagenameFields, columnCaseMap);
  }

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
        setFiles([]);
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

  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
      <button type="button" onClick={handleUpload} disabled={!files.length || loading} style={{ marginLeft: '0.5rem' }}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
