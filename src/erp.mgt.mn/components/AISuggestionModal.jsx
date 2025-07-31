import React from 'react';
import Modal from './Modal.jsx';

export default function AISuggestionModal({ visible, items = [], onSelect, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} title="AI Suggestions" onClose={onClose} width="auto">
      {items.length === 0 ? (
        <p>No suggestions.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: '0.5rem' }}>
              <span>{`${it.code} - ${it.qty}`}</span>
              <button
                type="button"
                style={{ marginLeft: '0.5rem' }}
                onClick={() => onSelect && onSelect(it)}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
