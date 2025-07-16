import React, { useEffect, useState, useRef } from 'react';
import RowFormModal from '../components/RowFormModal.jsx';
import { useToast } from '../context/ToastContext.jsx';

export default function PosTransactionsPage() {
  const { addToast } = useToast();
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [formConfigs, setFormConfigs] = useState({});
  const [columnMeta, setColumnMeta] = useState({});
  const [values, setValues] = useState({});
  const [layout, setLayout] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [sessionFields, setSessionFields] = useState([]);
  const refs = useRef({});
  const dragInfo = useRef(null);

  function focusFirst(table) {
    const wrap = refs.current[table];
    if (!wrap) return;
    const el = wrap.querySelector('input, textarea, select, button');
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }

  useEffect(() => {
    fetch('/api/pos_txn_config', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigs(data))
      .catch(() => setConfigs({}));
  }, []);

  useEffect(() => {
    if (!name) { setConfig(null); setLayout({}); return; }
    fetch(`/api/pos_txn_config?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg) => {
        if (cfg && Array.isArray(cfg.tables) && cfg.tables.length > 0 && !cfg.masterTable) {
          const [master, ...rest] = cfg.tables;
          cfg = { ...cfg, masterTable: master.table || '', masterForm: master.form || '', masterType: master.type || 'single', masterPosition: master.position || 'upper_left', tables: rest };
        }
        setConfig(cfg);
        setFormConfigs({});
        setValues({});
      })
      .catch(() => { setConfig(null); });
    fetch(`/api/pos_txn_layout?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : {})
      .then(data => setLayout(data || {}))
      .catch(() => setLayout({}));
  }, [name]);

  useEffect(() => {
    if (!config) return;
    const tables = [config.masterTable, ...config.tables.map(t => t.table)];
    const forms = [config.masterForm || '', ...config.tables.map(t => t.form)];
    tables.forEach((tbl, idx) => {
      const form = forms[idx];
      if (!tbl || !form) return;
      fetch(`/api/transaction_forms?table=${encodeURIComponent(tbl)}&name=${encodeURIComponent(form)}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : null)
        .then(cfg => setFormConfigs(f => ({ ...f, [tbl]: cfg || {} })))
        .catch(() => {});
      fetch(`/api/tables/${encodeURIComponent(tbl)}/columns`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(cols => setColumnMeta(m => ({ ...m, [tbl]: cols || [] })))
        .catch(() => {});
    });
  }, [config]);

  useEffect(() => {
    if (!config) { setSessionFields([]); return; }
    const fields = [];
    const check = (tbl, field) => {
      if (!tbl || !field) return;
      if (field.toLowerCase().includes('session')) fields.push({ table: tbl, field });
    };
    (config.calcFields || []).forEach(row => {
      row.cells.forEach(c => check(c.table, c.field));
    });
    (config.posFields || []).forEach(p => {
      (p.parts || []).forEach(pt => check(pt.table, pt.field));
    });
    setSessionFields(fields);
  }, [config]);

  function handleChange(tbl, changes) {
    setValues(v => ({ ...v, [tbl]: { ...v[tbl], ...changes } }));
  }

  async function handleSubmit(tbl, row) {
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(tbl)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(row),
      });
      if (res.ok) addToast('Saved', 'success');
      else addToast('Save failed', 'error');
    } catch {
      addToast('Save failed', 'error');
    }
  }

  async function handleSaveLayout() {
    if (!name) return;
    const info = {};
    const list = [
      { table: config.masterTable },
      ...config.tables,
    ];
    list.forEach((t) => {
      const el = refs.current[t.table];
      if (el) {
        info[t.table] = {
          width: el.offsetWidth,
          height: el.offsetHeight,
          x: layout[t.table]?.x || 0,
          y: layout[t.table]?.y || 0,
        };
      }
    });
    await fetch('/api/pos_txn_layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, layout: info }),
    });
    addToast('Layout saved', 'success');
  }

  function handleNew() {
    if (!config) return;
    const sid = 'sess_' + Date.now().toString(36);
    const next = {};
    sessionFields.forEach(sf => {
      if (!next[sf.table]) next[sf.table] = {};
      next[sf.table][sf.field] = sid;
    });
    if (config.statusField?.table && config.statusField.field && config.statusField.created) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.created;
    }
    setValues(next);
    setPendingId(null);
  }

  async function handleSavePending() {
    if (!name) return;
    try {
      const res = await fetch('/api/pos_txn_pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: pendingId, name, data: values }),
      });
      const js = await res.json().catch(() => ({}));
      if (js.id) {
        setPendingId(js.id);
        addToast('Saved', 'success');
      } else {
        addToast('Save failed', 'error');
      }
    } catch {
      addToast('Save failed', 'error');
    }
  }

  async function handleLoadPending() {
    if (!name) return;
    const list = await fetch(`/api/pos_txn_pending?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : {})
      .catch(() => ({}));
    const ids = Object.keys(list);
    if (ids.length === 0) { addToast('No pending', 'info'); return; }
    const sel = window.prompt('Select ID:\n' + ids.join('\n'));
    if (!sel) return;
    const rec = await fetch(`/api/pos_txn_pending?id=${encodeURIComponent(sel)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .catch(() => null);
    if (rec && rec.data) {
      setValues(rec.data);
      setPendingId(sel);
    }
  }

  async function handleDeletePending() {
    if (!pendingId) return;
    await fetch(`/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setPendingId(null);
    setValues({});
  }

  async function handlePostAll() {
    if (!name) return;
    // basic required field check
    for (const t of [{ table: config.masterTable }, ...config.tables]) {
      const fc = formConfigs[t.table];
      if (!fc) continue;
      const req = fc.requiredFields || [];
      const row = values[t.table] || {};
      for (const f of req) {
        if (row[f] === undefined || row[f] === '') {
          addToast('Missing required fields', 'error');
          return;
        }
      }
    }
    try {
      const res = await fetch('/api/pos_txn_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, data: values }),
      });
      if (res.ok) {
        setPendingId(null);
        if (config.statusField?.table && config.statusField.field && config.statusField.posted) {
          setValues(v => ({
            ...v,
            [config.statusField.table]: {
              ...(v[config.statusField.table] || {}),
              [config.statusField.field]: config.statusField.posted,
            },
          }));
        }
        addToast('Posted', 'success');
      } else {
        addToast('Post failed', 'error');
      }
    } catch {
      addToast('Post failed', 'error');
    }
  }

  function startDrag(table, e) {
    const startX = e.clientX;
    const startY = e.clientY;
    const cur = layout[table] || {};
    dragInfo.current = { table, startX, startY, x: cur.x || 0, y: cur.y || 0 };
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!dragInfo.current) return;
    const { table, startX, startY, x, y } = dragInfo.current;
    const nx = x + e.clientX - startX;
    const ny = y + e.clientY - startY;
    setLayout((l) => ({ ...l, [table]: { ...l[table], x: nx, y: ny } }));
  }

  function endDrag() {
    dragInfo.current = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  const configNames = Object.keys(configs);

  const formList = React.useMemo(() => {
    if (!config) return [];
    const arr = [{ table: config.masterTable, type: config.masterType, position: config.masterPosition, view: config.masterView }, ...config.tables];
    const seen = new Set();
    return arr.filter(t => {
      if (!t.table) return false;
      if (seen.has(t.table)) return false;
      seen.add(t.table);
      return true;
    });
  }, [config]);

  return (
    <div>
      <h2>POS Transactions</h2>
      {configNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select value={name} onChange={e => setName(e.target.value)}>
            <option value="">-- select config --</option>
            {configNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      {config && (
        <>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleSaveLayout}>Save Layout</button>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleNew} style={{ marginRight: '0.5rem' }}>New</button>
            <button onClick={handleSavePending} style={{ marginRight: '0.5rem' }}>Save</button>
            <button onClick={handleLoadPending} style={{ marginRight: '0.5rem' }}>Load</button>
            <button onClick={handleDeletePending} style={{ marginRight: '0.5rem' }}>Delete</button>
            <button onClick={handlePostAll}>POST</button>
          </div>
          <div
            style={{
              display: 'grid',
              gap: '0',
              gridTemplateColumns: '1fr 1fr 1fr',
              gridTemplateRows: 'auto auto auto auto auto',
            }}
          >
            {formList
              .filter(t => t.position !== 'hidden')
              .map((t, idx) => {
                const fc = formConfigs[t.table];
                if (!fc) return <div key={idx}>Loading...</div>;
                const meta = columnMeta[t.table] || [];
                const labels = {};
                meta.forEach((c) => {
                  labels[c.name || c] = c.label || c.name || c;
                });
                const visible = Array.isArray(fc.visibleFields) ? fc.visibleFields : [];
                const posStyle = {
                  top_row: { gridColumn: '1 / span 3', gridRow: '1' },
                  upper_left: { gridColumn: '1', gridRow: '2' },
                  upper_right: { gridColumn: '3', gridRow: '2' },
                  left: { gridColumn: '1', gridRow: '3' },
                  right: { gridColumn: '3', gridRow: '3' },
                  lower_left: { gridColumn: '1', gridRow: '4' },
                  lower_right: { gridColumn: '3', gridRow: '4' },
                  bottom_row: { gridColumn: '1 / span 3', gridRow: '5' },
                }[t.position] || { gridColumn: '2', gridRow: '3' };
                const saved = layout[t.table] || {};
                return (
                  <div
                    key={idx}
                    ref={(el) => (refs.current[t.table] = el)}
                    style={{
                      border: '1px solid #ccc',
                      resize: 'both',
                      overflow: 'auto',
                      width: saved.width || 'auto',
                      height: saved.height || 'auto',
                      margin: '-1px',
                      transform: `translate(${saved.x || 0}px, ${saved.y || 0}px)`,
                      position: 'relative',
                      ...posStyle,
                    }}
                  >
                    <h3
                      style={{ margin: '0.5rem', cursor: 'move' }}
                      onMouseDown={(e) => startDrag(t.table, e)}
                    >
                      {t.table}
                    </h3>
                    <RowFormModal
                      inline
                      visible
                      columns={visible}
                      requiredFields={fc.requiredFields || []}
                      labels={labels}
                      onChange={(changes) => handleChange(t.table, changes)}
                      onSubmit={(row) => handleSubmit(t.table, row)}
                      useGrid={t.view === 'table' || t.type === 'multi'}
                      fitted={t.view === 'fitted'}
                      onNextForm={() => focusFirst(formList[idx + 1]?.table)}
                    />
                  </div>
                );
              })
          </div>
        </>
      )}
    </div>
  );
}
