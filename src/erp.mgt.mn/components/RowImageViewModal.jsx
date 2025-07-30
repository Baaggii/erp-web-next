import React from 'react';
import Modal from './Modal.jsx';

export default function RowImageViewModal({ visible, onClose, images = [], onDelete }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} title="View Images" onClose={onClose} width="auto">
      {images.length === 0 && <p>No images</p>}
      {images.map((src, idx) => (
        <div key={idx} style={{ marginBottom: '0.5rem' }}>
          <img src={src} alt="" style={{ maxWidth: '100%' }} />
          {onDelete && (
            <button type="button" onClick={() => onDelete(src)} style={{ marginLeft: '0.5rem' }}>
              Delete
            </button>
          )}
        </div>
      ))}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
