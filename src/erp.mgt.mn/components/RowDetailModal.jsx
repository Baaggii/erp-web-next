import React from 'react';
import Modal from './Modal.jsx';
import { useTranslation } from 'react-i18next';
import normalizeDateInput from '../utils/normalizeDateInput.js';

export default function RowDetailModal({
  visible,
  onClose,
  row = {},
  columns = [],
  relations = {},
  references = [],
  labels = {},
  fieldTypeMap = {},
}) {
  const { t } = useTranslation();
  const safeRow = row || {};
  const cols = columns.length > 0 ? columns : Object.keys(safeRow);
  const placeholders = React.useMemo(() => {
    const map = {};
    cols.forEach((c) => {
      const typ = fieldTypeMap[c];
      if (typ === 'time') {
        map[c] = 'HH:MM:SS';
      } else if (typ === 'date' || typ === 'datetime') {
        map[c] = 'YYYY-MM-DD';
      }
    });
    return map;
  }, [cols, fieldTypeMap]);
  const chipStyle = React.useMemo(
    () => ({
      display: 'inline-flex',
      alignItems: 'center',
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
      color: '#1d4ed8',
      borderRadius: '9999px',
      padding: '0.1rem 0.5rem',
      fontSize: '0.75rem',
      maxWidth: '14ch',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    [],
  );
  const parseMaybeJson = React.useCallback((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const startsWith = trimmed[0];
    const endsWith = trimmed[trimmed.length - 1];
    if (
      (startsWith === '{' && endsWith === '}') ||
      (startsWith === '[' && endsWith === ']') ||
      (startsWith === '"' && endsWith === '"')
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }, []);

  if (!visible) return null;

  const labelMap = {};
  Object.entries(relations).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
      labelMap[col][String(o.value)] = o.label;
    });
  });

  return (
    <Modal visible={visible} title={t('row_details', 'Row Details')} onClose={onClose}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <tbody>
            {cols.map((c) => (
              <tr key={c}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    width: '15ch',
                  }}
                >
                  {labels[c] || c}
                </th>
                <td
                  style={{
                    padding: '0.25rem',
                    border: '1px solid #d1d5db',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {(() => {
                    const raw = relations[c]
                      ? labelMap[c][safeRow[c]] || safeRow[c]
                      : safeRow[c];
                    const parsed = parseMaybeJson(raw);
                    if (Array.isArray(parsed)) {
                      const primitives = parsed.filter(
                        (item) =>
                          item !== null &&
                          item !== undefined &&
                          (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'),
                      );
                      if (primitives.length === parsed.length) {
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                            {primitives.map((item, idx) => (
                              <span key={`${c}-${idx}-${item}`} style={chipStyle}>
                                {String(item)}
                              </span>
                            ))}
                          </div>
                        );
                      }
                    }
                    const str = String(parsed ?? '');
                    let display;
                    if (placeholders[c]) {
                      display = normalizeDateInput(str, placeholders[c]);
                    } else if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
                      display = normalizeDateInput(str, 'YYYY-MM-DD');
                    } else {
                      display = str;
                    }
                    return display;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {references.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <strong>{t('references', 'References')}</strong>
            {references.map((r, idx) => (
              <div key={idx} style={{ marginTop: '0.25rem' }}>
                {r.table} ({r.count}) - {r.column} = {r.value}
              </div>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'right' }}>
          <button type="button" onClick={onClose}>{t('close', 'Close')}</button>
        </div>
    </Modal>
  );
}
