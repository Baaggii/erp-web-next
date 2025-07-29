import React from 'react';
import Modal from './Modal.jsx';
import InventoryImageUpload from './InventoryImageUpload.jsx';

export default function RowImageUploadModal({ visible, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <InventoryImageUpload multiple />
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
