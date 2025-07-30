import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import buildImageName from '../utils/buildImageName.js';
import { useToast } from '../context/ToastContext.jsx';

export default function RowImageViewModal({
  visible,
  onClose,
  table,
  folder,
  row = {},
  imagenameFields = [],
  columnCaseMap = {},
}) {
  const [files, setFiles] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [fullscreen, setFullscreen] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (!visible) return;
    const { name } = buildImageName(row, imagenameFields, columnCaseMap);
    if (!folder || !name) {
      setFiles([]);
      return;
    }
    const safeTable = encodeURIComponent(table);
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    addToast(`Search: ${params.get('folder') || table}/${name}`, 'info');
    fetch(`/api/transaction_images/${safeTable}/${encodeURIComponent(name)}?${params.toString()}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((imgs) => {
        const list = Array.isArray(imgs) ? imgs : [];
        addToast(`Found ${list.length} image(s)`, 'info');
        setFiles(list);
      })
      .catch(() => setFiles([]));
  }, [visible, folder, row, table]);

  useEffect(() => {
    if (!visible) {
      setShowGallery(false);
      setFullscreen(null);
    }
  }, [visible]);

  if (!visible) return null;

  const handleView = (src) => {
    setFullscreen(src);
  };

  const listView = (
    <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
      {files.map((src) => {
        const name = src.split('/').pop();
        return (
          <div key={src} style={{ marginBottom: '0.25rem' }}>
            <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
            <span
              style={{ cursor: 'pointer', color: '#2563eb' }}
              onClick={() => handleView(src)}
            >
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );

  const gallery = (
    <div
      style={{
        maxHeight: '70vh',
        overflowY: 'auto',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}
    >
      {files.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          style={{ cursor: 'pointer', width: '150px', height: '150px', objectFit: 'cover' }}
          onClick={() => handleView(src)}
        />
      ))}
    </div>
  );

  return (
    <Modal visible={visible} title="Images" onClose={onClose} width="auto">
      {files.length === 0 ? <p>No images</p> : showGallery ? gallery : listView}
      {files.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
          <button type="button" onClick={() => setShowGallery((v) => !v)} style={{ marginRight: '0.5rem' }}>
            {showGallery ? 'List view' : 'View all images'}
          </button>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {fullscreen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // use a larger z-index so the image appears above the modal itself
            zIndex: 1100,
          }}
          onClick={() => setFullscreen(null)}
        >
          <img src={fullscreen} alt="" style={{ maxWidth: '90%', maxHeight: '90%' }} />
        </div>
      )}
    </Modal>
  );
}
