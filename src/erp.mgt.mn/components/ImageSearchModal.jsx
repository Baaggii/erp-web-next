import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  const [items, setItems] = useState(images);
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    setItems(images);
  }, [images]);

  async function handleDelete(src) {
    if (!window.confirm('Delete this image?')) return;
    try {
      const url = new URL(src, window.location.origin);
      const match = url.pathname.match(/^\/api\/[^/]+\/[^/]+\/(.+)$/);
      if (!match) return;
      const rel = match[1];
      const parts = rel.split('/');
      const file = parts.pop();
      const folder = parts.join('/');
      const table = parts[0] || 'unused';
      const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';
      const delUrl = `/api/transaction_images/${encodeURIComponent(table)}/unused/${encodeURIComponent(file)}${qs}`;
      const res = await fetch(delUrl, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setItems((it) => it.filter((i) => i !== src));
      }
    } catch {
      /* ignore */
    }
  }

  const showPrev = (e) => {
    e.stopPropagation();
    setFullscreenIndex((i) => (i > 0 ? i - 1 : items.length - 1));
  };

  const showNext = (e) => {
    e.stopPropagation();
    setFullscreenIndex((i) => (i < items.length - 1 ? i + 1 : 0));
  };

  return (
    <>
      <Modal visible={visible} title={`Images for "${term}"`} onClose={onClose} width="80%">
        {items.length === 0 ? (
          <div>No images found.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '0.5rem',
            }}
          >
            {items.map((src, idx) => (
              <div key={src} style={{ position: 'relative' }}>
                <img
                  src={src}
                  style={{ width: '100%', height: 'auto', objectFit: 'cover', cursor: 'pointer' }}
                  onClick={() => setFullscreenIndex(idx)}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(src);
                  }}
                  style={{
                    position: 'absolute',
                    top: '0.25rem',
                    left: '0.25rem',
                    background: 'red',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  delete
                </button>
              </div>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => setShowGallery(true)}>
              View all images
            </button>
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
      {showGallery &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: 1100,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => setShowGallery(false)}>
                Close
              </button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
                marginTop: '1rem',
                alignContent: 'start',
              }}
            >
              {items.map((src, idx) => (
                <div key={src} style={{ position: 'relative', aspectRatio: '1 / 1' }}>
                  <img
                    src={src}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => setFullscreenIndex(idx)}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(src);
                    }}
                    style={{
                      position: 'absolute',
                      top: '0.25rem',
                      right: '0.25rem',
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    delete
                  </button>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
      {fullscreenIndex !== null &&
        createPortal(
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
              zIndex: 1200,
            }}
            onClick={() => setFullscreenIndex(null)}
          >
            <button
              type="button"
              onClick={showPrev}
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              Prev
            </button>
            <img
              src={items[fullscreenIndex]}
              alt=""
              style={{ maxWidth: '90%', maxHeight: '90%' }}
            />
            <button
              type="button"
              onClick={showNext}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              Next
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
