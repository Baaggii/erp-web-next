import React from 'react';
import Modal from './Modal.jsx';
import InventoryImageUpload from './InventoryImageUpload.jsx';

export default function RowImageUploadModal({ visible, onClose, table, row = {}, imagenameFields = [] }) {
  if (!visible) return null;
  const baseName = imagenameFields.map((f) => row[f]).filter(Boolean).join('_');
  const uploadUrl = baseName && table ? `/api/transaction_images/${table}/${encodeURIComponent(baseName)}` : '';
  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
      <InventoryImageUpload multiple uploadUrl={uploadUrl || '/api/ai_inventory/identify'} />
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
