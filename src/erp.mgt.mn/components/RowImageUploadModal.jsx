import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import buildImageName from '../utils/buildImageName.js';

export default function RowImageUploadModal({
  visible,
  onClose,
  folder,
  row = {},
  imagenameFields = [],
  columnCaseMap = {},
  onUploaded = () => {},
}) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  function buildName() {
    return buildImageName(row, imagenameFields, columnCaseMap);
  }

  useEffect(() => {
    if (!visible) return;
    const { name } = buildName();
    if (!folder || !name) {
      setUploaded([]);
      return;
    }
    fetch(`/api/transaction_images/${folder}/${encodeURIComponent(name)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((imgs) => setUploaded(Array.isArray(imgs) ? imgs : []))
      .catch(() => setUploaded([]));
  }, [visible, folder, row]);

  async function handleUpload(selectedFiles) {
    const { name: safeName, missing } = buildName();
    const finalName = safeName || `tmp_${Date.now()}`;
    if (!folder) {
      addToast('Image folder is missing', 'error');
      return;
    }
    if (missing.length) {
      addToast(
        `Image name is missing fields: ${missing.join(', ')}. Temporary name will be used`,
        'warn',
      );
    }
    const uploadUrl = `/api/transaction_images/${folder}/${encodeURIComponent(finalName)}`;
    const filesToUpload = Array.from(selectedFiles || files);
    if (!filesToUpload.length) return;
    setLoading(true);
    const form = new FormData();
    filesToUpload.forEach((f) => form.append('images', f));
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: form, credentials: 'include' });
      if (res.ok) {
        addToast(`Images uploaded as ${finalName}`, 'success');
        const imgs = await res.json().catch(() => []);
        setFiles([]);
        setUploaded((u) => [...u, ...imgs]);
        onUploaded(finalName);
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
    if (!folder || !name) return;
    try {
      await fetch(
        `/api/transaction_images/${folder}/${encodeURIComponent(name)}/${encodeURIComponent(file)}`,
        { method: 'DELETE', credentials: 'include' },
      );
      setUploaded((u) => u.filter((f) => !f.endsWith(`/${file}`)));
    } catch {}
  }

  async function deleteAll() {
    const { name } = buildName();
    if (!folder || !name) return;
    try {
      await fetch(`/api/transaction_images/${folder}/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setUploaded([]);
    } catch {}
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="file"
          multiple
          onChange={(e) => {
            const selected = Array.from(e.target.files);
            setFiles(selected);
            handleUpload(selected);
          }}
        />
        {loading && <span style={{ marginLeft: '0.5rem' }}>Uploading...</span>}
      </div>
      {uploaded.length > 0 && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {uploaded.map((src) => {
            const name = src.split('/').pop();
            return (
              <div key={src} style={{ marginBottom: '0.25rem' }}>
                <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
                <span style={{ marginRight: '0.5rem' }}>{name}</span>
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
