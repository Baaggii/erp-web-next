import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import buildImageName from '../utils/buildImageName.js';
import { API_BASE, API_ROOT } from '../utils/apiBase.js';
import { useToast } from '../context/ToastContext.jsx';

export default function RowImageViewModal({
  visible,
  onClose,
  table,
  folder,
  row = {},
  columnCaseMap = {},
  configs = {},
}) {
  const [files, setFiles] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [fullscreen, setFullscreen] = useState(null);
  const { addToast } = useToast();
  const loaded = useRef(false);

  const placeholder =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAZLr5z0AAAAASUVORK5CYII=';
  // Root URL for static assets like uploaded images
  const apiRoot = API_ROOT;
  function getCase(obj, field) {
    if (!obj) return undefined;
    if (obj[field] !== undefined) return obj[field];
    const lower = field.toLowerCase();
    if (obj[columnCaseMap[lower]] !== undefined) return obj[columnCaseMap[lower]];
    const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
    return key ? obj[key] : undefined;
  }

  const sanitize = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, '_');

  function pickConfig(cfgs = {}, r = {}) {
    const tVal =
      getCase(r, 'transtype') ||
      getCase(r, 'Transtype') ||
      getCase(r, 'UITransType') ||
      getCase(r, 'UITransTypeName');
    for (const cfg of Object.values(cfgs)) {
      if (!cfg.transactionTypeValue) continue;
      if (
        tVal !== undefined &&
        String(tVal) === String(cfg.transactionTypeValue)
      ) {
        return cfg;
      }
      if (cfg.transactionTypeField) {
        const val = getCase(r, cfg.transactionTypeField);
        if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
          return cfg;
        }
      } else {
        const matchField = Object.keys(r).find(
          (k) => String(getCase(r, k)) === String(cfg.transactionTypeValue),
        );
        if (matchField) return { ...cfg, transactionTypeField: matchField };
      }
    }
    return {};
  }

  function buildFallbackName(r = {}) {
    const fields = [
      'z_mat_code',
      'or_bcode',
      'bmtr_pmid',
      'pmid',
      'sp_primary_code',
      'pid',
    ];
    const parts = [];
    const base = fields.map((f) => getCase(r, f)).filter(Boolean).join('_');
    if (base) parts.push(base);
    const o1 = [getCase(r, 'bmtr_orderid'), getCase(r, 'bmtr_orderdid')]
      .filter(Boolean)
      .join('~');
    const o2 = [getCase(r, 'ordrid'), getCase(r, 'ordrdid')]
      .filter(Boolean)
      .join('~');
    const ord = o1 || o2;
    if (ord) parts.push(ord);
    const transTypeVal =
      getCase(r, 'TransType') ||
      getCase(r, 'UITransType') ||
      getCase(r, 'UITransTypeName') ||
      getCase(r, 'transtype');
    const tType =
      getCase(r, 'trtype') ||
      getCase(r, 'UITrtype') ||
      getCase(r, 'TRTYPENAME') ||
      getCase(r, 'trtypename') ||
      getCase(r, 'uitranstypename') ||
      getCase(r, 'transtype');
    if (transTypeVal) parts.push(transTypeVal);
    if (tType) parts.push(tType);
    return sanitize(parts.join('_'));
  }

  useEffect(() => {
    if (!visible || loaded.current) return;
    loaded.current = true;

    const cfg = pickConfig(configs, row);
    let primary = '';
    let idName = '';
    if (cfg?.imagenameField?.length) {
      primary = buildImageName(row, cfg.imagenameField, columnCaseMap).name;
    }
    if (!primary) {
      primary = buildFallbackName(row);
    }
    if (cfg?.imageIdField) {
      idName = buildImageName(row, [cfg.imageIdField], columnCaseMap).name;
    }
    const altNames = [];
    if (idName && idName !== primary) altNames.push(idName);
    if (row._imageName && ![primary, ...altNames].includes(row._imageName)) {
      altNames.push(row._imageName);
    }
    addToast(`Primary image name: ${primary}`, 'info');
    if (altNames.length) {
      addToast(`Alt image names: ${altNames.join(', ')}`, 'info');
    }
    if (!folder || !primary) {
      setFiles([]);
      return;
    }
    const safeTable = encodeURIComponent(table);
    const folders = [folder];
    if (folder !== table && table.startsWith('transactions_')) {
      folders.push(table);
    }
    addToast(`Folders to search: ${folders.join(', ')}`, 'info');
    (async () => {
      for (const fld of folders) {
        const params = new URLSearchParams();
        if (fld) params.set('folder', fld);
        const url = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${params.toString()}`;
        addToast(`Searching URL: ${url}`, 'info');
        try {
          const res = await fetch(url, { credentials: 'include' });
          const imgs = res.ok ? await res.json().catch(() => []) : [];
          const list = Array.isArray(imgs) ? imgs : [];
          if (list.length > 0) {
            list.forEach((p) => addToast(`Found image: ${p}`, 'info'));
            const entries = list.map((p) => ({
              path: p,
              name: p.split('/').pop(),
              src: p.startsWith('http') ? p : `${apiRoot}${p}`,
            }));
            setFiles(entries);
            return;
          }
        } catch {
          /* ignore */
        }
        for (const nm of altNames) {
          const altUrl = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(nm)}?${params.toString()}`;
          addToast(`Searching URL: ${altUrl}`, 'info');
          try {
            const res = await fetch(altUrl, { credentials: 'include' });
            const imgs = res.ok ? await res.json().catch(() => []) : [];
            const list = Array.isArray(imgs) ? imgs : [];
            if (list.length > 0) {
              if (nm === idName && idName && idName !== primary) {
                try {
                  const renameParams = new URLSearchParams();
                  if (folder) renameParams.set('folder', folder);
                  const renameUrl = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(idName)}/rename/${encodeURIComponent(primary)}?${renameParams.toString()}`;
                  addToast(`Renaming via: ${renameUrl}`, 'info');
                  await fetch(renameUrl, { method: 'POST', credentials: 'include' });
                  const res2 = await fetch(
                    `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${renameParams.toString()}`,
                    { credentials: 'include' },
                  );
                  const imgs2 = res2.ok ? await res2.json().catch(() => []) : [];
                  const list2 = Array.isArray(imgs2) ? imgs2 : [];
                  if (list2.length > 0) {
                    list2.forEach((p) => addToast(`Found image: ${p}`, 'info'));
                    const entries = list2.map((p) => ({
                      path: p,
                      name: p.split('/').pop(),
                      src: p.startsWith('http') ? p : `${apiRoot}${p}`,
                    }));
                    setFiles(entries);
                    return;
                  }
                } catch {
                  /* ignore */
                }
              } else {
                list.forEach((p) => addToast(`Found image: ${p}`, 'info'));
                const entries = list.map((p) => ({
                  path: p,
                  name: p.split('/').pop(),
                  src: p.startsWith('http') ? p : `${apiRoot}${p}`,
                }));
                setFiles(entries);
                return;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
      addToast('No images found', 'info');
      setFiles([]);
    })();
  }, [visible, folder, row, table, configs]);

  useEffect(() => {
    if (!visible) {
      setShowGallery(false);
      setFullscreen(null);
      loaded.current = false;
    }
  }, [visible]);

  if (!visible) return null;

  const handleView = (src) => {
    addToast(`Showing image: ${src}`, 'info');
    setFullscreen(src);
  };

  const listView = (
    <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
      {files.map((f) => (
        <div key={f.path} style={{ marginBottom: '0.25rem' }}>
          <img
            src={f.src}
            alt=""
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = placeholder;
            }}
            style={{ maxWidth: '100px', marginRight: '0.5rem' }}
          />
          <span
            style={{ cursor: 'pointer', color: '#2563eb' }}
            onClick={() => handleView(f.src)}
          >
            {f.name}
          </span>
        </div>
      ))}
    </div>
  );

  const gallery = (
    <div
      style={{
        maxHeight: '70vh',
        overflowY: 'auto',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}
    >
      {files.map((f) => (
        <img
          key={f.path}
          src={f.src}
          alt=""
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = placeholder;
          }}
          style={{ cursor: 'pointer', width: '150px', height: '150px', objectFit: 'cover' }}
          onClick={() => handleView(f.src)}
        />
      ))}
    </div>
  );

  return (
    <Modal visible={visible} title="Images" onClose={onClose} width="auto">
      {files.length === 0 ? <p>No images</p> : showGallery ? gallery : listView}
      {files.length > 0 && (
        <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
          <button type="button" onClick={() => setShowGallery((v) => !v)} style={{ marginRight: '0.5rem' }}>
            {showGallery ? 'List view' : 'View all images'}
          </button>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
      </div>
      {fullscreen &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
            }}
            onClick={() => setFullscreen(null)}
          >
            <img
              src={fullscreen}
              alt=""
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = placeholder;
              }}
              style={{ maxWidth: '90%', maxHeight: '90%' }}
            />
          </div>,
          document.body,
        )}
    </Modal>
  );
}
