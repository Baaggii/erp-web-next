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
  const [gridValues, setGridValues] = useState({});
  const [pendingId, setPendingId] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [pendingList, setPendingList] = useState([]);
  const [sessionFields, setSessionFields] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [layout, setLayout] = useState({});
  const refs = useRef({});
  const formRefs = useRef({});
  const dragInfo = useRef(null);

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
        if (!cfg || !Array.isArray(cfg.tables)) {
          addToast('Config not found', 'error');
          setConfig(null);
          return;
        }
        if (cfg.tables.length > 0 && !cfg.masterTable) {
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
    const tables = [config.masterTable, ...(config.tables || []).map(t => t.table)];
    const forms = [config.masterForm || '', ...(config.tables || []).map(t => t.form)];
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
    if (!name) { setPendingList([]); return; }
    fetch(`/api/pos_txn_pending?name=${encodeURIComponent(name)}`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : {})
      .then(data => setPendingList(Object.entries(data)))
      .catch(() => setPendingList([]));
  }, [name, isSaved]);

  useEffect(() => {
    if (!config) { setSessionFields([]); return; }
    const tbls = [config.masterTable, ...(config.tables || []).map(t => t.table)];
    const fields = [];
    if (Array.isArray(config.calcFields)) {
      config.calcFields.forEach(row => {
        if (!Array.isArray(row.cells)) return;
        row.cells.forEach((cell, idx) => {
          if (cell.field && /session/i.test(cell.field)) {
            const tbl = cell.table || tbls[idx];
            if (tbl) fields.push({ table: tbl, field: cell.field });
          }
        });
      });
    }
    setSessionFields(fields);
  }, [config]);

  function handleChange(tbl, changes) {
    setValues(v => ({ ...v, [tbl]: { ...v[tbl], ...changes } }));
  }

  function handleRowsChange(tbl, rows) {
    setGridValues(v => ({ ...v, [tbl]: rows }));
  }


  async function handleSaveLayout() {
    if (!name) return;
    const info = {};
    const list = [
      { table: config.masterTable },
      ...(config.tables || []),
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

  function applySession(id) {
    setSessionId(id);
    setValues(v => {
      const next = { ...v };
      sessionFields.forEach(sf => {
        next[sf.table] = { ...(next[sf.table] || {}), [sf.field]: id };
      });
      return next;
    });
    setGridValues(g => {
      const next = { ...g };
      sessionFields.forEach(sf => {
        if (Array.isArray(next[sf.table])) {
          next[sf.table] = next[sf.table].map(r => ({ ...r, [sf.field]: id }));
        }
      });
      return next;
    });
  }

  function handleNew() {
    const sid = 'sess_' + Date.now().toString(36);
    setValues({ [config.masterTable]: { [config.statusField.field]: config.statusField.created } });
    setGridValues({});
    setPendingId('');
    setIsSaved(false);
    applySession(sid);
  }

  async function handleSave() {
    if (!name) return;
    const body = { name, data: { single: values, multi: gridValues } };
    const res = await fetch('/api/pos_txn_pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: pendingId || undefined, ...body }),
    });
    if (res.ok) {
      const data = await res.json();
      setPendingId(data.id);
      setIsSaved(true);
      addToast('Saved', 'success');
    } else addToast('Save failed', 'error');
  }

  async function handleLoad() {
    if (pendingList.length === 0) { addToast('No pending', 'info'); return; }
    const choice = window.prompt('Enter ID to load:\n' + pendingList.map(([id]) => id).join('\n'));
    if (!choice) return;
    const res = await fetch(`/api/pos_txn_pending?id=${encodeURIComponent(choice)}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;
    setValues(data.data?.single || {});
    setGridValues(data.data?.multi || {});
    setPendingId(choice);
    setIsSaved(true);
    const sidField = sessionFields[0];
    if (sidField) {
      const val = (data.data?.single?.[sidField.table] || {})[sidField.field];
      if (val) setSessionId(val);
    }
  }

  async function handleDelete() {
    if (!pendingId) return;
    await fetch(`/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`, { method: 'DELETE', credentials: 'include' });
    setValues({});
    setGridValues({});
    setPendingId('');
    setIsSaved(false);
    addToast('Deleted', 'success');
  }

  async function handlePost() {
    if (!pendingId) return;
    const res = await fetch('/api/pos_txn_post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, data: { single: values, multi: gridValues } }),
    });
    if (res.ok) {
      setValues(v => ({ ...v, [config.masterTable]: { ...(v[config.masterTable] || {}), [config.statusField.field]: config.statusField.posted } }));
      await handleDelete();
      addToast('Posted', 'success');
    } else addToast('Post failed', 'error');
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

  function focusNext(tbl) {
    if (!config) return;
    const all = [
      { table: config.masterTable, type: config.masterType, position: config.masterPosition, view: config.masterView },
      ...(config.tables || []),
    ];
    const posOrder = {
      top_row: 1,
      upper_left: 2,
      upper_right: 3,
      left: 4,
      right: 5,
      lower_left: 6,
      lower_right: 7,
      bottom_row: 8,
    };
    const filtered = all.filter(t => t.position !== 'hidden');
    filtered.sort((a,b) => (posOrder[a.position]||9) - (posOrder[b.position]||9));
    const idx = filtered.findIndex(t => t.table === tbl);
    const next = filtered[idx + 1];
    if (next) formRefs.current[next.table]?.focusFirstField?.();
  }

  const configNames = Object.keys(configs);

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
            <button onClick={handleNew}>New</button>{' '}
            <button onClick={handleSave}>Save</button>{' '}
            <button onClick={handleLoad} disabled={!isSaved}>Load</button>{' '}
            <button onClick={handleDelete} disabled={!pendingId}>Delete</button>{' '}
            <button onClick={handlePost} disabled={!pendingId}>POST</button>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button onClick={handleSaveLayout}>Save Layout</button>
          </div>
          <div
            style={{
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: '1fr 1fr 1fr',
              gridTemplateRows: 'auto auto auto auto auto',
            }}
          >
            {(() => {
              const all = [
                { table: config.masterTable, type: config.masterType, position: config.masterPosition, view: config.masterView },
                ...(config.tables || []),
              ];
              const seen = new Set();
              const posOrder = {
                top_row: 1,
                upper_left: 2,
                upper_right: 3,
                left: 4,
                right: 5,
                lower_left: 6,
                lower_right: 7,
                bottom_row: 8,
              };
              const filtered = [];
              all.forEach(t => {
                const key = `${t.table}|${t.form}`;
                if (!seen.has(key)) { seen.add(key); filtered.push(t); }
              });
              filtered.sort((a,b) => (posOrder[a.position]||9)-(posOrder[b.position]||9));
              return filtered.filter(t => t.position !== 'hidden').map((t, idx) => {
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
                      ref={el => (formRefs.current[t.table] = el)}
                      inline
                      visible
                      columns={visible}
                      requiredFields={fc.requiredFields || []}
                      labels={labels}
                      onChange={(changes) => handleChange(t.table, changes)}
                      onRowsChange={(rows) => handleRowsChange(t.table, rows)}
                      useGrid={t.view === 'table' || t.type === 'multi'}
                      fitted={t.view === 'fitted'}
                      onEnterLastField={() => focusNext(t.table)}
                    />
                  </div>
                );
              });
            })()}
          </div>
        </>
      )}
    </div>
  );
}
