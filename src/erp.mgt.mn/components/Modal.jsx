import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ visible, title, onClose, children, width = 'auto' }) {
  const [closing, setClosing] = useState(false);
  const modalRef = useRef(null);
  const posRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible) return;
    function handleKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible]);

  function handleClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose && onClose();
    }, 200);
  }

  function startDrag(e) {
    const rect = modalRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    function move(ev) {
      posRef.current = { x: ev.clientX - offsetX, y: ev.clientY - offsetY };
      if (modalRef.current) {
        modalRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
      }
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
  }

  if (!visible && !closing) return null;

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: closing ? 0 : 1,
    transition: 'opacity 0.2s',
    zIndex: 1000,
  };

  const modalStyle = {
    backgroundColor: '#fff',
    borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    maxHeight: '90vh',
    overflowY: 'auto',
    width,
    minWidth: '300px',
  };

  const headerStyle = {
    cursor: 'move',
    padding: '0.5rem 1rem',
    borderBottom: '1px solid #ddd',
    background: '#f7f7f7',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const content = (
    <div
      style={overlayStyle}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div ref={modalRef} style={modalStyle}>
        <div style={headerStyle} onMouseDown={startDrag}>
          <span>{title}</span>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '1rem' }}>{children}</div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

