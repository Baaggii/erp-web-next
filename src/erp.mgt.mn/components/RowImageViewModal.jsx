import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import buildImageName from '../utils/buildImageName.js';
import { API_BASE } from '../utils/apiBase.js';
import { useToast } from '../context/ToastContext.jsx';

export default function RowImageViewModal({
  visible,
  onClose,
  table,
  folder,
  row = {},
  imagenameFields = [],
  columnCaseMap = {},
  imageIdField = '',
}) {
  const [files, setFiles] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [fullscreen, setFullscreen] = useState(null);
  const { addToast } = useToast();

  const placeholder =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAZLr5z0AAAAASUVORK5CYII=';
  const apiRoot = API_BASE.replace(/\/api\/?$/, '');

  useEffect(() => {
    if (!visible) return;
    const primary = buildImageName(
      row,
      imagenameFields.length
        ? Array.from(
            new Set([...imagenameFields, imageIdField].filter(Boolean)),
          )
        : imageIdField
        ? [imageIdField]
        : [],
      columnCaseMap,
    ).name;
    const { name: idName } = imageIdField
      ? buildImageName(row, [imageIdField], columnCaseMap)
      : { name: '' };
    const altNames = [];
    if (idName && idName !== primary) altNames.push(idName);
    if (row._imageName && row._imageName !== primary && !altNames.includes(row._imageName)) {
      altNames.push(row._imageName);
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
    function buildFileList(list) {
      return list.map((p) => ({
        path: p,
        name: p.split('/').pop(),
        src: p.startsWith('http') ? p : `${apiRoot}${p}`,
      }));
    }

    (async () => {
      for (const fld of folders) {
        const params = new URLSearchParams();
        if (fld) params.set('folder', fld);
        addToast(`Search: ${params.get('folder') || table}/${primary}`, 'info');
        try {
          const res = await fetch(
            `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${params.toString()}`,
            { credentials: 'include' },
          );
          const imgs = res.ok ? await res.json().catch(() => []) : [];
          const list = Array.isArray(imgs) ? imgs : [];
          if (list.length > 0) {
            list.forEach((p) => addToast(`Found image: ${p}`, 'info'));
            setFiles(buildFileList(list));
            return;
          }
        } catch {
          /* ignore */
        }
        for (const nm of altNames) {
          addToast(`Search: ${params.get('folder') || table}/${nm}`, 'info');
          try {
            const res = await fetch(
              `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(nm)}?${params.toString()}`,
              { credentials: 'include' },
            );
            const imgs = res.ok ? await res.json().catch(() => []) : [];
            const list = Array.isArray(imgs) ? imgs : [];
            if (list.length > 0) {
              if (nm === idName && idName && idName !== primary) {
                try {
                  const renameParams = new URLSearchParams();
                  if (folder) renameParams.set('folder', folder);
                  await fetch(
                    `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(idName)}/rename/${encodeURIComponent(primary)}?${renameParams.toString()}`,
                    { method: 'POST', credentials: 'include' },
                  );
                  const res2 = await fetch(
                    `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${renameParams.toString()}`,
                    { credentials: 'include' },
                  );
                  const imgs2 = res2.ok ? await res2.json().catch(() => []) : [];
                  const list2 = Array.isArray(imgs2) ? imgs2 : [];
                  if (list2.length > 0) {
                    list2.forEach((p) => addToast(`Found image: ${p}`, 'info'));
                    setFiles(buildFileList(list2));
                    return;
                  }
                } catch {
                  /* ignore */
                }
              } else {
                list.forEach((p) => addToast(`Found image: ${p}`, 'info'));
                setFiles(buildFileList(list));
                return;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
      setFiles([]);
    })();
  }, [visible, folder, row, table, imageIdField, imagenameFields]);

  useEffect(() => {
    if (!visible) {
      setShowGallery(false);
      setFullscreen(null);
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
