import React, { useEffect, useState, useRef, useContext } from 'react';
import formatTimestamp from '../utils/formatTimestamp.js';
import RowFormModal from '../components/RowFormModal.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';

function parseErrorField(msg) {
  if (!msg) return null;
  let m = msg.match(/FOREIGN KEY \(`([^`]*)`\)/i);
  if (m) return m[1];
  m = msg.match(/column '([^']+)'/i);
  if (m) return m[1];
  m = msg.match(/for key '([^']+)'/i);
  if (m) return m[1];
  return null;
}

function PendingSelectModal({ visible, list = [], onSelect, onClose }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    function handleKey(e) {
      if (e.key === 'ArrowDown') {
        setIdx((v) => Math.min(v + 1, list.length - 1));
      } else if (e.key === 'ArrowUp') {
        setIdx((v) => Math.max(v - 1, 0));
      } else if (e.key === 'Enter') {
        onSelect(list[idx]?.id);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, list, idx, onSelect]);

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Select Pending" onClose={onClose}>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((rec, i) => (
          <li
            key={rec.id}
            style={{
              padding: '0.25rem 0.5rem',
              background: i === idx ? '#e0e0ff' : 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setIdx(i)}
            onClick={() => onSelect(rec.id)}
          >
            {rec.id} {rec.savedAt ? `(${rec.savedAt.slice(0, 19)})` : ''}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

async function postRow(addToast, table, row) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const js = await res.json().catch(() => ({}));
      const msg = js.message || res.statusText;
      const field = parseErrorField(msg);
      const val = field && row ? row[field] : undefined;
      addToast(
        `Request failed: ${msg}${
          field ? ` (field ${field}=${val})` : ''
        }`,
        'error',
      );
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    addToast(`Request failed: ${err.message}`, 'error');
    return null;
  }
}

async function putRow(addToast, table, id, row) {
  try {
    const res = await fetch(`/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const js = await res.json().catch(() => ({}));
      const msg = js.message || res.statusText;
      const field = parseErrorField(msg);
      const val = field && row ? row[field] : undefined;
      addToast(
        `Request failed: ${msg}${field ? ` (field ${field}=${val})` : ''}`,
        'error',
      );
      return false;
    }
    return true;
  } catch (err) {
    addToast(`Request failed: ${err.message}`, 'error');
    return false;
  }
}

export default function PosTransactionsPage() {
  const { addToast } = useToast();
  const { user, company } = useContext(AuthContext);
  const generalConfig = useGeneralConfig();
  const [configs, setConfigs] = useState({});
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [formConfigs, setFormConfigs] = useState({});
  const [columnMeta, setColumnMeta] = useState({});
  const [values, setValues] = useState({});
  const [layout, setLayout] = useState({});
  const [relationsMap, setRelationsMap] = useState({});
  const [relationConfigs, setRelationConfigs] = useState({});
  const [relationData, setRelationData] = useState({});
  const [procTriggersMap, setProcTriggersMap] = useState({});
  const [pendingId, setPendingId] = useState(null);
  const [sessionFields, setSessionFields] = useState([]);
  const [masterId, setMasterId] = useState(null);
  const [pendingList, setPendingList] = useState([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [postedId, setPostedId] = useState(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const masterIdRef = useRef(null);
  const refs = useRef({});
  const dragInfo = useRef(null);

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  async function loadRelations(tbl) {
    try {
      const res = await fetch(`/api/tables/${encodeURIComponent(tbl)}/relations`, { credentials: 'include' });
      if (!res.ok) return;
      const rels = await res.json().catch(() => []);
      const dataMap = {};
      const cfgMap = {};
      const rowMap = {};
      for (const r of rels) {
        const refTbl = r.REFERENCED_TABLE_NAME;
        const refCol = r.REFERENCED_COLUMN_NAME;
        let cfg = null;
        try {
          const cRes = await fetch(`/api/display_fields?table=${encodeURIComponent(refTbl)}`, { credentials: 'include' });
          if (cRes.ok) cfg = await cRes.json().catch(() => null);
        } catch {
          cfg = null;
        }
        let page = 1;
        const perPage = 500;
        let rows = [];
        while (true) {
          const params = new URLSearchParams({ page, perPage });
          const refRes = await fetch(`/api/tables/${encodeURIComponent(refTbl)}?${params.toString()}`, { credentials: 'include' });
          if (!refRes.ok) break;
          const js = await refRes.json().catch(() => ({}));
          if (Array.isArray(js.rows)) {
            rows = rows.concat(js.rows);
            if (rows.length >= (js.count || rows.length) || js.rows.length < perPage) break;
          } else break;
          page += 1;
        }
        const opts = [];
        const rMap = {};
        rows.forEach((row) => {
          const val = row[refCol];
          const parts = [];
          if (val !== undefined) parts.push(val);
          let displayFields = [];
          if (cfg && Array.isArray(cfg.displayFields) && cfg.displayFields.length > 0) {
            displayFields = cfg.displayFields;
          } else {
            displayFields = Object.keys(row).filter((f) => f !== refCol).slice(0, 1);
          }
          parts.push(...displayFields.map((f) => row[f]).filter((v) => v !== undefined));
          const label = parts.join(' - ');
          opts.push({ value: val, label });
          rMap[val] = row;
        });
        if (opts.length > 0) dataMap[r.COLUMN_NAME] = opts;
        if (Object.keys(rMap).length > 0) rowMap[r.COLUMN_NAME] = rMap;
        cfgMap[r.COLUMN_NAME] = { table: refTbl, column: refCol, displayFields: cfg?.displayFields || [] };
      }
      setRelationsMap((m) => ({ ...m, [tbl]: dataMap }));
      setRelationConfigs((m) => ({ ...m, [tbl]: cfgMap }));
      setRelationData((m) => ({ ...m, [tbl]: rowMap }));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

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

  const initRef = useRef('');

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
        setRelationsMap({});
        setRelationConfigs({});
        setRelationData({});
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
        .then(cols => {
          setColumnMeta(m => ({ ...m, [tbl]: cols || [] }));
          loadRelations(tbl);
        })
        .catch(() => {});
      fetch(`/api/proc_triggers?table=${encodeURIComponent(tbl)}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : {})
        .then(data => setProcTriggersMap(m => ({ ...m, [tbl]: data || {} })))
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

  const masterSessionValue = React.useMemo(() => {
    if (!config) return undefined;
    const masterSf = sessionFields.find((f) => f.table === config.masterTable);
    if (!masterSf) return undefined;
    return values[config.masterTable]?.[masterSf.field];
  }, [values, config, sessionFields]);

  useEffect(() => {
    if (!config) return;
    const tables = [config.masterTable, ...config.tables.map((t) => t.table)];
    if (!tables.every((tbl) => formConfigs[tbl])) return;
    if (initRef.current === name) return;
    initRef.current = name;
    handleNew();
  }, [config, formConfigs, name]);

  useEffect(() => {
    if (!config) return;
    if (masterSessionValue === undefined) return;
    sessionFields.forEach((sf) => {
      if (sf.table === config.masterTable) return;
      setValues((v) => {
        const tblVal = v[sf.table];
        if (Array.isArray(tblVal)) {
          let changed = false;
          const updated = tblVal.map((r) => {
            if (r[sf.field] === masterSessionValue) return r;
            changed = true;
            return { ...r, [sf.field]: masterSessionValue };
          });
          if (changed) return { ...v, [sf.table]: updated };
          return v;
        }
        const cur = tblVal?.[sf.field];
        if (cur === masterSessionValue) return v;
        return {
          ...v,
          [sf.table]: { ...(tblVal || {}), [sf.field]: masterSessionValue },
        };
      });
    });
  }, [masterSessionValue, config, sessionFields]);

  function recalcTotals(vals) {
    if (!config || !config.masterTable) return vals;
    const totals = { total_quantity: 0, total_amount: 0, total_discount: 0 };
    for (const t of config.tables) {
      if (t.type !== 'multi') continue;
      const rows = Array.isArray(vals[t.table]) ? vals[t.table] : [];
      rows.forEach((r) => {
        Object.entries(r || {}).forEach(([k, v]) => {
          const key = k.toLowerCase();
          const num = Number(v) || 0;
          if (key.includes('qty')) totals.total_quantity += num;
          if (key.includes('amount') || key.includes('amt')) totals.total_amount += num;
          if (key.includes('discount') || key.includes('disc')) totals.total_discount += num;
        });
      });
    }
    const masterTbl = config.masterTable;
    return {
      ...vals,
      [masterTbl]: { ...(vals[masterTbl] || {}), ...totals },
    };
  }

  const hasData = React.useMemo(() => {
    return Object.values(values).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return v && Object.keys(v).length > 0;
    });
  }, [values]);

  function handleChange(tbl, changes) {
    setValues(v => {
      const next = { ...v, [tbl]: { ...v[tbl], ...changes } };
      return recalcTotals(next);
    });
  }

  function handleRowsChange(tbl, rows) {
    setValues(v => {
      const next = { ...v, [tbl]: Array.isArray(rows) ? rows : [] };
      return recalcTotals(next);
    });
  }

  async function handleSubmit(tbl, row) {
    const js = await postRow(addToast, tbl, row);
    if (js) addToast('Saved', 'success');
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

  async function handleNew() {
    if (!config) return;
    if ((pendingId || masterId) && hasData) {
      const save = window.confirm(
        'Save current transaction before starting new?',
      );
      if (save) await handleSavePending();
    }
    const sid = 'pos_' + Date.now().toString(36);
    const next = {};
    const allTables = [
      { table: config.masterTable, type: config.masterType },
      ...config.tables,
    ];
    allTables.forEach((t) => {
      next[t.table] = t.type === 'multi' ? [] : {};
    });
    sessionFields.forEach((sf) => {
      if (Array.isArray(next[sf.table])) return;
      next[sf.table][sf.field] = sid;
    });
    if (
      config.statusField?.table &&
      config.statusField.field &&
      config.statusField.created
    ) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.created;
    }
    Object.entries(formConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!next[tbl]) next[tbl] = {};
      Object.entries(defs).forEach(([k, v]) => {
        if (next[tbl][k] === undefined) next[tbl][k] = v;
      });
    });
    setValues(next);
    setMasterId(null);
    masterIdRef.current = null;
    setPendingId(null);
    addToast('New transaction started', 'success');
  }

  async function handleSavePending() {
    if (!name) return;
    const next = { ...values };
    if (
      config?.statusField?.table &&
      config.statusField.field &&
      config.statusField.beforePost
    ) {
      const tbl = config.statusField.table;
      if (!next[tbl]) next[tbl] = {};
      next[tbl][config.statusField.field] = config.statusField.beforePost;
    }
    // fill defaults and system fields when missing
    Object.entries(formConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!next[tbl]) next[tbl] = Array.isArray(values[tbl]) ? [] : {};
      const applyDefaults = (row) => {
        const updated = { ...row };
        Object.entries(defs).forEach(([k, v]) => {
          if (updated[k] === undefined) updated[k] = v;
        });
        if (fc.userIdFields && user?.empid !== undefined) {
          fc.userIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = user.empid;
          });
        }
        if (fc.branchIdFields && company?.branch_id !== undefined) {
          fc.branchIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = company.branch_id;
          });
        }
        if (fc.companyIdFields && company?.company_id !== undefined) {
          fc.companyIdFields.forEach((f) => {
            if (updated[f] === undefined) updated[f] = company.company_id;
          });
        }
        if (fc.transactionTypeField && fc.transactionTypeValue) {
          if (updated[fc.transactionTypeField] === undefined) {
            updated[fc.transactionTypeField] = fc.transactionTypeValue;
          }
        }
        return updated;
      };
      if (Array.isArray(next[tbl])) {
        next[tbl] = next[tbl].map((row) => applyDefaults(row));
      } else {
        next[tbl] = applyDefaults(next[tbl]);
      }
    });

    const mid = masterIdRef.current;
    const masterSf = sessionFields.find((f) => f.table === config.masterTable);
    const sid = masterSf ? next[config.masterTable]?.[masterSf.field] : pendingId || 'pos_' + Date.now().toString(36);

    const session = {
      employeeId: user?.empid,
      companyId: company?.company_id,
      branchId: company?.branch_id,
      date: formatTimestamp(new Date()),
    };
    try {
      const res = await fetch('/api/pos_txn_pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: sid, name, data: next, masterId: mid, session }),
      });
      const js = await res.json().catch(() => ({}));
      if (js.id) {
        setPendingId(sid);
        setValues(next);
        addToast('Saved', 'success');
      } else {
        const msg = js.message || res.statusText;
        const field = parseErrorField(msg);
        addToast(`Save failed: ${msg}${field ? ` (field ${field})` : ''}`, 'error');
      }
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    }
  }

  async function handleLoadPending() {
    if (!name) return;
    const list = await fetch(
      `/api/pos_txn_pending?name=${encodeURIComponent(name)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({}));
    const arr = Object.entries(list).map(([id, rec]) => ({ id, ...rec }));
    if (arr.length === 0) { addToast('No pending', 'info'); return; }
    setPendingList(arr);
    setShowLoadModal(true);
  }

  async function selectPending(id) {
    setShowLoadModal(false);
    if (!id) return;
    const rec = await fetch(
      `/api/pos_txn_pending?id=${encodeURIComponent(id)}`,
      { credentials: 'include' },
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    if (rec && rec.data) {
      setValues(rec.data);
      setPendingId(String(id).trim());
      setMasterId(rec.masterId || null);
      masterIdRef.current = rec.masterId || null;
      addToast('Loaded', 'success');
    } else {
      addToast('Load failed', 'error');
    }
  }

  async function handleDeletePending() {
    if (!pendingId) return;
    if (!window.confirm('Delete pending transaction?')) return;
    try {
      const res = await fetch(
        `/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      if (!res.ok) {
        const js = await res.json().catch(() => ({}));
        addToast(js.message || 'Delete failed', 'error');
        return;
      }
      setPendingId(null);
      setValues({});
      setMasterId(null);
      masterIdRef.current = null;
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
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
    const payload = { ...values };
    Object.entries(formConfigs).forEach(([tbl, fc]) => {
      const defs = fc.defaultValues || {};
      if (!payload[tbl]) payload[tbl] = {};
      Object.entries(defs).forEach(([k, v]) => {
        if (payload[tbl][k] === undefined) payload[tbl][k] = v;
      });
    });
    for (const map of config.calcFields || []) {
      if (!Array.isArray(map.cells) || map.cells.length < 2) continue;
      const [first, ...rest] = map.cells;
      const base = payload[first.table]?.[first.field];
      for (const c of rest) {
        if (payload[c.table]?.[c.field] !== base) {
          addToast('Mapping mismatch', 'error');
          return;
        }
      }
    }
    const single = {};
    const multi = {};
    formList.forEach((t) => {
      if (t.type === 'multi') multi[t.table] = payload[t.table];
      else single[t.table] = payload[t.table];
    });
    const postData = { masterId: masterIdRef.current, single, multi };
    const session = {
      employeeId: user?.empid,
      companyId: company?.company_id,
      branchId: company?.branch_id,
      date: formatTimestamp(new Date()),
    };
    try {
      const res = await fetch('/api/pos_txn_post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, data: postData, session }),
      });
      if (res.ok) {
        if (pendingId) {
          await fetch(`/api/pos_txn_pending?id=${encodeURIComponent(pendingId)}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }
        setPendingId(null);
        const js = await res.json().catch(() => ({}));
        if (js.id) setPostedId(js.id);
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
        const js = await res.json().catch(() => ({}));
        const msg = js.message || res.statusText;
        const field = parseErrorField(msg);
        addToast(`Post failed: ${msg}${field ? ` (field ${field})` : ''}`, 'error');
      }
    } catch (err) {
      addToast(`Post failed: ${err.message}`, 'error');
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
    const arr = [
      { table: config.masterTable, type: config.masterType, position: config.masterPosition, view: config.masterView },
      ...config.tables,
    ];
    const seen = new Set();
    const filtered = arr.filter((t) => {
      if (!t.table) return false;
      if (seen.has(t.table)) return false;
      seen.add(t.table);
      return true;
    });
    const order = [
      'top_row',
      'upper_left',
      'upper_right',
      'left',
      'right',
      'lower_left',
      'lower_right',
      'bottom_row',
      'hidden',
    ];
    return filtered.sort(
      (a, b) => order.indexOf(a.position) - order.indexOf(b.position),
    );
  }, [config]);

  return (
    <div>
      <h2>{config?.label || 'POS Transactions'}</h2>
      {configNames.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <select
            value={name}
            onChange={e => {
              const newName = e.target.value;
              setName(newName);
              initRef.current = '';
            }}
          >
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
            <button onClick={handleSavePending} style={{ marginRight: '0.5rem' }} disabled={!name || !hasData}>Save</button>
            <button onClick={handleLoadPending} style={{ marginRight: '0.5rem' }} disabled={!name}>Load</button>
            <button onClick={handleDeletePending} style={{ marginRight: '0.5rem' }} disabled={!pendingId}>Delete</button>
            <button onClick={handlePostAll} disabled={!pendingId}>POST</button>
          </div>
          {(pendingId || postedId) && (
            <div style={{ marginBottom: '0.5rem' }}>
              {pendingId && <span style={{ marginRight: '1rem' }}>Pending ID: {pendingId}</span>}
              {postedId && <span>Posted ID: {postedId}</span>}
            </div>
          )}
          <div
            style={
              isNarrow
                ? { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
                : {
                    display: 'grid',
                    gap: '0',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gridTemplateRows: 'auto auto auto auto auto',
                  }
            }
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
                const visible = Array.isArray(fc.visibleFields)
                  ? fc.visibleFields
                  : [];
                const headerFields =
                  fc.headerFields && fc.headerFields.length > 0
                    ? fc.headerFields
                    : [];
                const editable = Array.isArray(fc.editableFields)
                  ? fc.editableFields
                  : [];
                const disabled = editable.length
                  ? visible.filter((c) => !editable.includes(c))
                  : [];
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
                      margin: isNarrow ? '0 0 0.5rem 0' : '-1px',
                      transform: isNarrow
                        ? undefined
                        : `translate(${saved.x || 0}px, ${saved.y || 0}px)`,
                      position: 'relative',
                      ...(isNarrow ? {} : posStyle),
                    }}
                  >
                    <h3
                      style={{ margin: '0.5rem', cursor: 'move' }}
                      onMouseDown={(e) => startDrag(t.table, e)}
                    >
                      {t.table}
                    </h3>
                    <RowFormModal
                      key={`rf-${t.table}-${generalConfig.pos.boxWidth}`}
                      inline
                      visible
                      columns={visible}
                      disabledFields={disabled}
                      requiredFields={fc.requiredFields || []}
                      labels={labels}
                      row={values[t.table]}
                      rows={t.type === 'multi' ? values[t.table] : undefined}
                      headerFields={headerFields}
                      defaultValues={fc.defaultValues || {}}
                    relations={relationsMap[t.table] || {}}
                    relationConfigs={relationConfigs[t.table] || {}}
                    relationData={relationData[t.table] || {}}
                    procTriggers={procTriggersMap[t.table] || {}}
                    user={user}
                    company={company}
                    columnCaseMap={(columnMeta[t.table] || []).reduce((m,c)=>{m[c.name.toLowerCase()] = c.name;return m;}, {})}
                    onChange={(changes) => handleChange(t.table, changes)}
                    onRowsChange={(rows) => handleRowsChange(t.table, rows)}
                      onSubmit={() => true}
                      useGrid={t.view === 'table' || t.type === 'multi'}
                      fitted={t.view === 'fitted'}
                      scope="pos"
                      labelFontSize={generalConfig.pos.labelFontSize}
                      boxWidth={generalConfig.pos.boxWidth}
                      boxHeight={generalConfig.pos.boxHeight}
                      boxMaxWidth={generalConfig.pos.boxMaxWidth}
                      boxMaxHeight={generalConfig.pos.boxMaxHeight}
                      dateField={fc.dateField || []}
                      onNextForm={() => {
                        let next = idx + 1;
                        while (next < formList.length) {
                          const nf = formConfigs[formList[next].table];
                          const ed = Array.isArray(nf?.editableFields)
                            ? nf.editableFields
                            : [];
                          if (ed.length > 0) break;
                          next += 1;
                        }
                        if (next < formList.length) focusFirst(formList[next].table);
                      }}
                    />
                  </div>
                );
              })}
          </div>
          <PendingSelectModal
            visible={showLoadModal}
            list={pendingList}
            onSelect={selectPending}
            onClose={() => setShowLoadModal(false)}
          />
        </>
      )}
    </div>
  );
}
