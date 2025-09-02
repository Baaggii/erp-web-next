import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { useTranslation } from 'react-i18next';

export default function CascadeDeleteModal({ visible, references = [], onCancel, onConfirm }) {
  const { t } = useTranslation();
  const [rowsByTable, setRowsByTable] = useState({});

  useEffect(() => {
    if (!visible) return;
    let canceled = false;
    async function load() {
      const data = {};
      for (const ref of references) {
        try {
          const params = new URLSearchParams({ perPage: 5 });
          params.set(ref.column, ref.value);
          const res = await fetch(`/api/tables/${encodeURIComponent(ref.table)}?${params.toString()}`, { credentials: 'include' });
          const json = await res.json();
          if (!canceled) data[ref.table] = json.rows || [];
        } catch {
          /* ignore errors */
        }
      }
      if (!canceled) setRowsByTable(data);
    }
    load();
    return () => {
      canceled = true;
    };
  }, [visible, references]);

  if (!visible) return null;

  return (
    <Modal visible={visible} title={t('delete_related_records', 'Delete Related Records?')} onClose={onCancel}>
        {references.map((r) => (
          <div key={`${r.table}-${r.column}-${r.value}`} style={{ marginBottom: '1rem' }}>
            <strong>{r.table}</strong> ({r.count})
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.25rem' }}>
              <tbody>
                {(rowsByTable[r.table] || []).map((row, idx) => (
                  <tr key={idx}>
                    {Object.values(row).slice(0, 3).map((v, i) => (
                      <td key={i} style={{ border: '1px solid #d1d5db', padding: '0.25rem' }}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ textAlign: 'right' }}>
          <button type="button" onClick={onCancel} style={{ marginRight: '0.5rem' }}>
            {t('cancel', 'Cancel')}
          </button>
          <button type="button" onClick={onConfirm}>{t('delete_all', 'Delete All')}</button>
        </div>
    </Modal>
  );
}
