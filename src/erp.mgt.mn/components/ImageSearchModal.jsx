import React from 'react';
import Modal from './Modal.jsx';

export default function ImageSearchModal({
  visible,
  term,
  images = [],
  page = 1,
  total = 0,
  perPage = 20,
  onClose,
  onPrev,
  onNext,
}) {
  const totalPages = Math.ceil(total / perPage);
  return (
    <Modal visible={visible} title={`Images for "${term}"`} onClose={onClose} width="80%">
      {images.length === 0 ? (
        <div>No images found.</div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: '0.5rem',
          }}
        >
          {images.map((src) => (
            <img key={src} src={src} style={{ width: '100%', height: 'auto', objectFit: 'cover' }} />
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div
          style={{
            marginTop: '0.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <button onClick={onPrev} disabled={page <= 1}>
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button onClick={onNext} disabled={page >= totalPages}>
            Next
          </button>
        </div>
      )}
    </Modal>
  );
}
