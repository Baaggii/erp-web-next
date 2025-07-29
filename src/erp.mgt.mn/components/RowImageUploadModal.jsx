import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';

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
  const baseName = imagenameFields
    .map((f) => {
      let val = row[f] ?? row[columnCaseMap[f.toLowerCase()]];
      if (val && typeof val === 'object') val = val.value ?? val.label;
      return val;
    })
    .filter((v) => v !== undefined && v !== null && v !== '')
    .join('_');
  const uploadUrl = baseName && table ? `/api/transaction_images/${table}/${encodeURIComponent(baseName)}` : '';

  async function handleUpload() {
    if (!uploadUrl) {
      addToast('Image name is missing', 'error');
      return;
    }
    if (!files.length) return;
    setLoading(true);
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: form, credentials: 'include' });
      if (res.ok) {
        addToast('Images uploaded successfully', 'success');
        setFiles([]);
        onUploaded(baseName);
      } else {
        addToast('Failed to upload images', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error uploading images', 'error');
    }
    setLoading(false);
  }

  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
      <button onClick={handleUpload} disabled={!files.length || loading} style={{ marginLeft: '0.5rem' }}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
