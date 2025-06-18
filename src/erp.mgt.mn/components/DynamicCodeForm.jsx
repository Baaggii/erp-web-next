import React, { useEffect, useState } from 'react';
import SearchSelect from './SearchSelect.jsx';

export default function DynamicCodeForm({ form, onSubmit }) {
  const [options, setOptions] = useState({});
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!form) return;
    const load = async () => {
      const map = {};
      for (const fld of form.fields) {
        if (fld.type === 'code' && fld.table) {
          try {
            const params = new URLSearchParams({ perPage: 1000 });
            const res = await fetch(`/api/tables/${encodeURIComponent(fld.table)}?${params.toString()}`, { credentials: 'include' });
            const json = await res.json();
            if (Array.isArray(json.rows)) {
              map[fld.name] = json.rows.map((r) => {
                const cells = Object.values(r).slice(0, 2);
                return { value: r.id || r.code || r[fld.name], label: cells.join(' - ') };
              });
            }
          } catch {
            map[fld.name] = [];
          }
        }
      }
      setOptions(map);
    };
    load();
  }, [form]);

  useEffect(() => {
    if (!form) return;
    const vals = {};
    form.fields.forEach((f) => { vals[f.name] = ''; });
    setValues(vals);
  }, [form]);

  if (!form) return null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(values); }}>
      {form.fields.map((f) => (
        <div key={f.name} style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>{f.label}</label>
          {f.type === 'code' ? (
            <SearchSelect
              value={values[f.name]}
              onChange={(val) => setValues((v) => ({ ...v, [f.name]: val }))}
              options={options[f.name] || []}
            />
          ) : (
            <input
              type={f.type}
              value={values[f.name]}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem' }}
            />
          )}
        </div>
      ))}
      <div style={{ textAlign: 'right' }}>
        <button type="submit">Submit</button>
      </div>
    </form>
  );
}
