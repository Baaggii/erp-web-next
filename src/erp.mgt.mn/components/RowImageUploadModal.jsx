import React, { useState, useEffect } from 'react';
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
  setField,
}) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  if (!visible) return null;
  function buildName() {
    return buildImageName(row, imagenameFields, columnCaseMap);
  }
  function buildFolder() {
    return buildFolderName(row, imageFolderFields, columnCaseMap);
  }

  function getTempName() {
    const { name, missing } = buildName();
    if (!name || missing.length) {
      if (!row._imageName) {
        const uid = Math.random().toString(36).slice(2, 10);
        if (setField) setField('_imageName', uid);
      }
      return row._imageName || '';
    }
    return name;
  }

  useEffect(() => {
    if (!visible) return;
    const { name: folder } = buildFolder();
    const safe = getTempName();
    if (!safe) return;
    const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
    fetch(`/api/transaction_images/${table}/${encodeURIComponent(safe)}${query}`, {
      credentials: 'include',
    })
      .then((res) => res.ok ? res.json() : [])
      .then((imgs) => setUploaded(imgs))
      .catch(() => setUploaded([]));
  }, [visible]);

  async function handleUpload() {
    const { name: folder } = buildFolder();
    const safeName = getTempName();
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
        if (setField) setField('_imageName', safeName);
        onUploaded(safeName, folder);
        const list = await fetch(`/api/transaction_images/${table}/${encodeURIComponent(safeName)}${query}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []);
        setUploaded(list);
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
      {uploaded.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h4 className="mt-0 mb-1">Uploaded Images</h4>
          {uploaded.map((src, idx) => (
            <div key={idx} style={{ marginBottom: '0.25rem' }}>
              <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
              <button
                type="button"
                onClick={async () => {
                  const parts = src.split('/');
                  const file = parts[parts.length - 1];
                  const { name: folder } = buildFolder();
                  const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
                  await fetch(`/api/transaction_images/${table}/${encodeURIComponent(getTempName())}/${encodeURIComponent(file)}${query}`, {
                    method: 'DELETE',
                    credentials: 'include',
                  });
                  setUploaded((u) => u.filter((_, i) => i !== idx));
                }}
              >
                Delete
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={async () => {
              const { name: folder } = buildFolder();
              const query = folder ? `?folder=${encodeURIComponent(folder)}` : '';
              await fetch(`/api/transaction_images/${table}/${encodeURIComponent(getTempName())}${query}`, {
                method: 'DELETE',
                credentials: 'include',
              });
              setUploaded([]);
            }}
          >
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
