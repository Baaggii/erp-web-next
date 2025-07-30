import React, { useState } from 'react';
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
  if (!visible) return null;
  function buildName() {
    return buildImageName(row, imagenameFields, columnCaseMap);
  }
  function buildFolder() {
    return buildFolderName(row, imageFolderFields, columnCaseMap);
  }

  async function handleUpload() {
    const { name: folder } = buildFolder();
    const { name: safeName, missing } = buildName();
    if (!safeName || missing.length) {
      addToast('Please post the transaction before uploading images.', 'error');
      return;
    }
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
        const info = folder ? `${folder}/${safeName}` : safeName;
        addToast(`Images uploaded as ${info}`, 'success');
        setFiles([]);
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
