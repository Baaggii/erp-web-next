import React, { useState, useEffect, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import { API_BASE, API_ROOT } from '../utils/apiBase.js';
import resolveImageNames from '../utils/resolveImageNames.js';
import { buildImageThumbnailUrl } from '../utils/transactionImageThumbnails.js';
import { useToast } from '../context/ToastContext.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext.jsx';

export default function RowImageViewModal({
  visible,
  onClose,
  table,
  folder,
  row = {},
  columnCaseMap = {},
  configs = {},
  currentConfig = {},
  currentConfigName = '',
  canDelete = true,
  useAllConfigsWhenMissing = false,
}) {
  const baseZIndex = 16000;
  const [files, setFiles] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const { t } = useTranslation();
  const { company, user } = useContext(AuthContext);
  const requestRef = useRef(0);
  const lastSearchRef = useRef({ key: '', hadImages: false });
  const toast = (msg, type = 'info') => {
    if (type === 'info' && !generalConfig?.general?.imageToastEnabled) return;
    addToast(msg, type);
  };
  const showConversionIssues = (issues = []) => {
    if (!generalConfig?.general?.imageToastEnabled) return;
    issues.forEach((issue) => {
      const detail = issue?.detail ? ` (${issue.detail})` : '';
      toast(
        `Sharp conversion ${issue?.reason || 'error'} for ${issue?.file || 'image'}${detail}`,
        'error',
      );
    });
  };
  const parseImagesPayload = async (res) => {
    if (!res?.ok) return [];
    const payload = await res.json().catch(() => []);
    const list = Array.isArray(payload) ? payload : payload?.files || [];
    if (Array.isArray(payload?.conversionIssues)) {
      showConversionIssues(payload.conversionIssues);
    }
    return list;
  };
  const placeholder =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAZLr5z0AAAAASUVORK5CYII=';
  // Root URL for static assets like uploaded images
  const apiRoot = API_ROOT;
  const sanitize = (name) =>
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, '_');
  const normalizeEmpId = (value) =>
    value == null ? '' : sanitize(String(value));
  const viewerEmpId = user?.empid || user?.empId || user?.id || '';
  const extractUploaderId = (name = '') => {
    const match = String(name).match(/__u([^_]+?)__/i);
    return match ? match[1] : null;
  };
  const canDeleteFile = (fileName) => {
    if (!canDelete) return false;
    const uploader = extractUploaderId(fileName);
    if (!uploader) return false;
    return normalizeEmpId(uploader) === normalizeEmpId(viewerEmpId);
  };

  useEffect(() => {
    if (!visible) return;
    const requestId = ++requestRef.current;
    const isCurrent = () => requestRef.current === requestId;
    setFiles([]);
    setShowGallery(false);
    setFullscreenIndex(null);

    const { primary, altNames, idName, configName } = resolveImageNames({
      row,
      columnCaseMap,
      company,
      configs,
      currentConfig,
      currentConfigName,
      useAllConfigsWhenMissing,
    });
    const searchKey = [
      table,
      folder,
      primary,
      altNames.join('|'),
      idName || '',
      company ?? '',
    ].join('::');
    if (currentConfigName) {
      toast(`Current config name: ${currentConfigName}`, 'info');
    }
    if (configName) {
      toast(`Image search config: ${configName}`, 'info');
    }
    toast(`Primary image name: ${primary}`, 'info');
    if (altNames.length) {
      toast(`Alt image names: ${altNames.join(', ')}`, 'info');
    }
    if (!folder || (!primary && altNames.length === 0)) {
      if (isCurrent()) setFiles([]);
      return;
    }
    const safeTable = encodeURIComponent(table);
    const folders = [folder];
    if (folder !== table && table.startsWith('transactions_')) {
      folders.push(table);
    }
    toast(`Folders to search: ${folders.join(', ')}`, 'info');
    (async () => {
      let foundAny = false;
      for (const fld of folders) {
        const params = new URLSearchParams();
        if (fld) params.set('folder', fld);
        if (company != null) params.set('companyId', company);
        const searchNames = [primary, ...altNames].filter(Boolean);
        for (const nm of searchNames) {
          const url = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(nm)}?${params.toString()}`;
          toast(`Searching URL: ${url}`, 'info');
          try {
            const res = await fetch(url, { credentials: 'include' });
            const list = await parseImagesPayload(res);
            if (list.length > 0) {
              foundAny = true;
              if (nm === idName && idName && idName !== primary && primary) {
                try {
                  const renameParams = new URLSearchParams();
                  if (folder) renameParams.set('folder', folder);
                  if (company != null) renameParams.set('companyId', company);
                  const renameUrl = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(idName)}/rename/${encodeURIComponent(primary)}?${renameParams.toString()}`;
                  toast(`Renaming via: ${renameUrl}`, 'info');
                  await fetch(renameUrl, { method: 'POST', credentials: 'include' });
                  const res2 = await fetch(
                    `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${renameParams.toString()}`,
                    { credentials: 'include' },
                  );
                  const list2 = await parseImagesPayload(res2);
                  if (list2.length > 0) {
                    foundAny = true;
                    list2.forEach((p) => toast(`Found image: ${p}`, 'info'));
                    const entries = list2.map((p) => ({
                      path: p,
                      name: p.split('/').pop(),
                      src: p.startsWith('http') ? p : `${apiRoot}${p}`,
                      thumbSrc: buildImageThumbnailUrl(p),
                    }));
                    lastSearchRef.current = { key: searchKey, hadImages: true };
                    if (isCurrent()) setFiles(entries);
                    return;
                  }
                } catch {
                  /* ignore */
                }
              } else {
                list.forEach((p) => toast(`Found image: ${p}`, 'info'));
                const entries = list.map((p) => ({
                  path: p,
                  name: p.split('/').pop(),
                  src: p.startsWith('http') ? p : `${apiRoot}${p}`,
                  thumbSrc: buildImageThumbnailUrl(p),
                }));
                lastSearchRef.current = { key: searchKey, hadImages: true };
                if (isCurrent()) setFiles(entries);
                return;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
      if (!foundAny) {
        const alreadyNotified =
          lastSearchRef.current.key === searchKey &&
          lastSearchRef.current.hadImages === false;
        if (!alreadyNotified) {
          toast('No images found', 'info');
        }
        lastSearchRef.current = { key: searchKey, hadImages: false };
      }
      if (isCurrent()) setFiles([]);
    })();
  }, [
    visible,
    folder,
    row,
    table,
    configs,
    currentConfig,
    currentConfigName,
    columnCaseMap,
    company,
  ]);

  useEffect(() => {
    if (!visible) {
      setShowGallery(false);
      setFullscreenIndex(null);
      lastSearchRef.current = { key: '', hadImages: false };
    }
  }, [visible]);

  if (!visible) return null;

  const handleView = (idx) => {
    const src = files[idx]?.src;
    if (src) toast(`Showing image: ${src}`, 'info');
    setFullscreenIndex(idx);
  };

  const handleDelete = async (file) => {
    if (!window.confirm('Delete this image?')) return;
    const safeTable = encodeURIComponent(table);
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    const name = row._imageName || 'unused';
    const url = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(name)}/${encodeURIComponent(file.name)}?${params.toString()}`;
    try {
      const res = await fetch(url, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.path !== file.path));
        toast('Image deleted', 'info');
      } else {
        toast('Failed to delete image', 'error');
      }
    } catch {
      toast('Failed to delete image', 'error');
    }
  };

  const showPrev = (e) => {
    e.stopPropagation();
    setFullscreenIndex((i) => (i > 0 ? i - 1 : files.length - 1));
  };

  const showNext = (e) => {
    e.stopPropagation();
    setFullscreenIndex((i) => (i < files.length - 1 ? i + 1 : 0));
  };

  const listView = (
    <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
      {files.map((f, idx) => (
        <div
          key={f.path}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.25rem 0',
          }}
        >
          <img
            src={f.thumbSrc || f.src}
            alt=""
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = placeholder;
            }}
            style={{
              width: '240px',
              height: '180px',
              objectFit: 'contain',
              background: '#111827',
              borderRadius: '0.25rem',
            }}
          />
          <span
            style={{ cursor: 'pointer', color: '#2563eb' }}
            onClick={() => handleView(idx)}
          >
            {f.name}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <Modal
        visible={visible}
        title={t('images', 'Images')}
        onClose={onClose}
        width="auto"
        zIndex={baseZIndex}
      >
        {files.length === 0 ? <p>{t('no_images', 'No images')}</p> : listView}
        {files.length > 0 && (
          <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
            <button type="button" onClick={() => setShowGallery(true)} style={{ marginRight: '0.5rem' }}>
              {t('view_all_images', 'View all images')}
            </button>
          </div>
        )}
        <div style={{ textAlign: 'right', marginTop: '1rem' }}>
          <button type="button" onClick={onClose}>{t('close', 'Close')}</button>
        </div>
      </Modal>
      {showGallery &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              zIndex: baseZIndex + 100,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => setShowGallery(false)}>{t('close', 'Close')}</button>
            </div>
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '0.75rem',
                marginTop: '1rem',
                alignContent: 'start',
              }}
            >
              {files.map((f, idx) => (
                <div
                  key={f.path}
                  style={{
                    position: 'relative',
                    background: '#0f172a',
                    borderRadius: '0.5rem',
                    padding: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '280px',
                  }}
                >
                  <img
                    src={f.src}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = placeholder;
                    }}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '340px',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleView(idx)}
                  />
                  {canDeleteFile(f.name) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(f);
                      }}
                      style={{
                        position: 'absolute',
                        top: '0.25rem',
                        right: '0.25rem',
                        background: 'red',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        padding: '0.25rem 0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      {t('delete', 'Delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
      {fullscreenIndex !== null &&
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
              zIndex: baseZIndex + 200,
            }}
            onClick={() => setFullscreenIndex(null)}
          >
            <button
              type="button"
              onClick={showPrev}
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              {t('prev', 'Prev')}
            </button>
            <img
              src={files[fullscreenIndex]?.src}
              alt=""
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = placeholder;
              }}
              style={{ maxWidth: '90%', maxHeight: '90%' }}
            />
            <button
              type="button"
              onClick={showNext}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            >
              {t('next', 'Next')}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
