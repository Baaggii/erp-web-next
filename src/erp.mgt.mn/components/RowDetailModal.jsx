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
  jsonFields = [],
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
  const jsonFieldSet = React.useMemo(
    () => new Set((jsonFields || []).map((f) => String(f))),
    [jsonFields],
  );
  const parseMaybeJson = React.useCallback((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if (
      (first === '[' && last === ']') ||
      (first === '{' && last === '}') ||
      (first === '"' && last === '"')
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }
    return value;
  }, []);
  const normalizeJsonArray = React.useCallback(
    (column, value) => {
      const parsed = jsonFieldSet.has(column) ? parseMaybeJson(value) : value;
      if (Array.isArray(parsed)) return parsed;
      if (parsed === undefined || parsed === null || parsed === '') return [];
      return [parsed];
    },
    [jsonFieldSet, parseMaybeJson],
  );

  if (!visible) return null;

  const labelMap = {};
  Object.entries(relations).forEach(([col, opts]) => {
    labelMap[col] = {};
    opts.forEach((o) => {
      labelMap[col][o.value] = o.label;
      labelMap[col][String(o.value)] = o.label;
    });
  });
  const resolveRelationValue = React.useCallback(
    (column, value) => {
      if (!relations[column]) return value;
      const map = labelMap[column] || {};
      if (Array.isArray(value)) {
        return value.map((item) => resolveRelationValue(column, item));
      }
      const key = typeof value === 'string' || typeof value === 'number' ? value : String(value);
      return map[key] !== undefined ? map[key] : value;
    },
    [labelMap, relations],
  );

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
                    const baseValue = jsonFieldSet.has(c)
                      ? parseMaybeJson(safeRow[c])
                      : safeRow[c];
                    const resolved = resolveRelationValue(c, baseValue);
                    const listValue = Array.isArray(resolved)
                      ? resolved
                      : normalizeJsonArray(c, resolved);
                    if (jsonFieldSet.has(c) || Array.isArray(resolved)) {
                      const parts = listValue
                        .map((item) => resolveRelationValue(c, item))
                        .map((item) => (item === null || item === undefined ? '' : String(item)))
                        .filter((item) => item);
                      return parts.length ? parts.join(', ') : '—';
                    }
                    const str = String(resolved ?? '');
                    if (placeholders[c]) {
                      return normalizeDateInput(str, placeholders[c]);
                    }
                    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
                      return normalizeDateInput(str, 'YYYY-MM-DD');
                    }
                    return str;
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
