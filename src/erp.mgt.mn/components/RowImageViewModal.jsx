import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import buildImageName from '../utils/buildImageName.js';
import { useToast } from '../context/ToastContext.jsx';

export default function RowImageViewModal({
  visible,
  onClose,
  folder,
  row = {},
  imagenameFields = [],
  columnCaseMap = {},
}) {
  const [files, setFiles] = useState([]);
  const { addToast } = useToast();

  useEffect(() => {
    if (!visible) return;
    const { name } = buildImageName(row, imagenameFields, columnCaseMap);
    if (!folder || !name) {
      setFiles([]);
      return;
    }
    const safeFolder = encodeURIComponent(folder);
    addToast(`Search: ${safeFolder}/${name}`, 'info');
    fetch(`/api/transaction_images/${safeFolder}/${encodeURIComponent(name)}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((imgs) => {
        const list = Array.isArray(imgs) ? imgs : [];
        addToast(`Found ${list.length} image(s)`, 'info');
        setFiles(list);
      })
      .catch(() => setFiles([]));
  }, [visible, folder, row]);

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Images" onClose={onClose} width="auto">
      {files.length === 0 ? (
        <p>No images</p>
      ) : (
        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {files.map((src) => {
            const name = src.split('/').pop();
            return (
              <div key={src} style={{ marginBottom: '0.25rem' }}>
                <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
                <span>{name}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
