import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

export default function TableSelectModal({
  table,
  visible,
  onClose,
  onSelect,
  idField = 'id',
}) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [cols, setCols] = useState([]);

  useEffect(() => {
    if (!visible) return;
    fetch(`/api/tables/${encodeURIComponent(table)}?perPage=500`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : { rows: [] }))
      .then((data) => {
        const r = data.rows || [];
        setRows(r);
        setCols(r.length > 0 ? Object.keys(r[0]) : []);
      })
      .catch(() => {
        setRows([]);
        setCols([]);
      });
  }, [table, visible]);

  function toggle(id) {
    setSelected((s) =>
      s.includes(id) ? s.filter((v) => v !== id) : [...s, id],
    );
  }

  function handleApply() {
    onSelect && onSelect(selected);
    setSelected([]);
    onClose && onClose();
  }

  return (
    <Modal visible={visible} title={`Select from ${table}`} onClose={onClose} width="80%">
      {rows.length === 0 ? (
        <p>No data</p>
      ) : (
        <>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th></th>
                {cols.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(String(r[idField]))}
                      onChange={() => toggle(String(r[idField]))}
                    />
                  </td>
                  {cols.map((c) => (
                    <td key={c}>{String(r[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '1rem', textAlign: 'right' }}>
            <button onClick={handleApply}>Apply</button>
          </div>
        </>
      )}
    </Modal>
  );
}
