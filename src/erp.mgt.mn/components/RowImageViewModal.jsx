import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal.jsx';
import buildImageName from '../utils/buildImageName.js';
import { API_BASE, API_ROOT } from '../utils/apiBase.js';
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
}) {
  const baseZIndex = 1300;
  const [files, setFiles] = useState([]);
  const [showGallery, setShowGallery] = useState(false);
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  const { addToast } = useToast();
  const generalConfig = useGeneralConfig();
  const { t } = useTranslation();
  const { company, user } = useContext(AuthContext);
  const toast = (msg, type = 'info') => {
    if (type === 'info' && !generalConfig?.general?.imageToastEnabled) return;
    addToast(msg, type);
  };

  const placeholder =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAZLr5z0AAAAASUVORK5CYII=';
  // Root URL for static assets like uploaded images
  const apiRoot = API_ROOT;
  function unwrapValue(value) {
    if (value && typeof value === 'object') {
      if (value.value !== undefined && value.value !== null) return value.value;
      if (value.id !== undefined && value.id !== null) return value.id;
      if (value.Id !== undefined && value.Id !== null) return value.Id;
      if (value.label !== undefined && value.label !== null) return value.label;
    }
    return value;
  }

  function getCase(obj, field) {
    if (!obj) return undefined;
    if (obj[field] !== undefined) return unwrapValue(obj[field]);
    const lower = field.toLowerCase();
    if (obj[columnCaseMap[lower]] !== undefined) {
      return unwrapValue(obj[columnCaseMap[lower]]);
    }
    const key = Object.keys(obj).find((k) => k.toLowerCase() === lower);
    return key ? unwrapValue(obj[key]) : undefined;
  }

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

  function pickConfigEntry(cfgs = {}, r = {}) {
    const tVal =
      getCase(r, 'transtype') ||
      getCase(r, 'Transtype') ||
      getCase(r, 'UITransType') ||
      getCase(r, 'UITransTypeName');
    for (const [configName, cfg] of Object.entries(cfgs)) {
      if (!cfg.transactionTypeValue) continue;
      if (
        tVal !== undefined &&
        String(tVal) === String(cfg.transactionTypeValue)
      ) {
        return { config: cfg, configName };
      }
      if (cfg.transactionTypeField) {
        const val = getCase(r, cfg.transactionTypeField);
        if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
          return { config: cfg, configName };
        }
      } else {
        const matchField = Object.keys(r).find(
          (k) => String(getCase(r, k)) === String(cfg.transactionTypeValue),
        );
        if (matchField) {
          return {
            config: { ...cfg, transactionTypeField: matchField },
            configName,
          };
        }
      }
    }
    return { config: {}, configName: '' };
  }

  function pickMatchingConfigs(cfgs = {}, r = {}) {
    const matches = [];
    const tVal =
      getCase(r, 'transtype') ||
      getCase(r, 'Transtype') ||
      getCase(r, 'UITransType') ||
      getCase(r, 'UITransTypeName');
    for (const [configName, cfg] of Object.entries(cfgs)) {
      if (!cfg?.transactionTypeValue) continue;
      if (
        tVal !== undefined &&
        String(tVal) === String(cfg.transactionTypeValue)
      ) {
        matches.push({ config: cfg, configName });
        continue;
      }
      if (cfg.transactionTypeField) {
        const val = getCase(r, cfg.transactionTypeField);
        if (val !== undefined && String(val) === String(cfg.transactionTypeValue)) {
          matches.push({ config: cfg, configName });
        }
      } else {
        const matchField = Object.keys(r).find(
          (k) => String(getCase(r, k)) === String(cfg.transactionTypeValue),
        );
        if (matchField) {
          matches.push({
            config: { ...cfg, transactionTypeField: matchField },
            configName,
          });
        }
      }
    }
    return matches;
  }

  function collectImageFields(entries = []) {
    const fieldSet = new Set();
    const imageIdFields = new Set();
    const configNames = [];
    entries.forEach(({ config, configName }) => {
      if (configName) configNames.push(configName);
      if (Array.isArray(config?.imagenameField)) {
        config.imagenameField.forEach((field) => {
          if (field) fieldSet.add(field);
        });
      }
      if (typeof config?.imageIdField === 'string' && config.imageIdField) {
        fieldSet.add(config.imageIdField);
        imageIdFields.add(config.imageIdField);
      }
    });
    return {
      fields: Array.from(fieldSet),
      configNames,
      imageIdFields: Array.from(imageIdFields),
    };
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
    if (!visible) return;
    setFiles([]);

    const { config: cfg, configName } = pickConfigEntry(configs, row);
    const preferredConfig = currentConfig && Object.keys(currentConfig).length
      ? currentConfig
      : cfg;
    const preferredConfigName = currentConfigName || configName;
    const preferredFields = Array.isArray(preferredConfig?.imagenameField)
      ? preferredConfig.imagenameField
      : [];
    const preferredImageIdField =
      typeof preferredConfig?.imageIdField === 'string' ? preferredConfig.imageIdField : '';
    const preferredFieldSet = Array.from(
      new Set([...preferredFields, preferredImageIdField].filter(Boolean)),
    );
    const preferredName = preferredFieldSet.length
      ? buildImageName(row, preferredFieldSet, columnCaseMap, company).name
      : '';
    let primary = '';
    const idFieldSet = new Set();
    if (preferredName) {
      primary = preferredName;
      if (preferredConfig?.imageIdField) {
        idFieldSet.add(preferredConfig.imageIdField);
      }
    }
    if (!primary) {
      const matchedConfigs = pickMatchingConfigs(configs, row);
      const { fields, configNames, imageIdFields } =
        collectImageFields(matchedConfigs);
      imageIdFields.forEach((field) => idFieldSet.add(field));
      if (fields.length > 0) {
        const { name } = buildImageName(row, fields, columnCaseMap, company);
        if (name) {
          primary = name;
        }
      }
    }
    if (!primary) {
      primary = buildFallbackName(row);
    }
    if (!primary && row?._imageName) {
      primary = row._imageName;
    }
    const altNames = [];
    let idName = '';
    idFieldSet.forEach((field) => {
      const { name } = buildImageName(row, [field], columnCaseMap, company);
      if (name && !idName) {
        idName = name;
      }
      if (name && name !== primary && !altNames.includes(name)) {
        altNames.push(name);
      }
    });
    if (row._imageName && ![primary, ...altNames].includes(row._imageName)) {
      altNames.push(row._imageName);
    }
    if (configName) {
      toast(`Image search config: ${configName}`, 'info');
    }
    toast(`Primary image name: ${primary}`, 'info');
    if (altNames.length) {
      toast(`Alt image names: ${altNames.join(', ')}`, 'info');
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
    toast(`Folders to search: ${folders.join(', ')}`, 'info');
    (async () => {
      for (const fld of folders) {
        const params = new URLSearchParams();
        if (fld) params.set('folder', fld);
        if (company != null) params.set('companyId', company);
        const url = `${API_BASE}/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${params.toString()}`;
        toast(`Searching URL: ${url}`, 'info');
        try {
          const res = await fetch(url, { credentials: 'include' });
          const imgs = res.ok ? await res.json().catch(() => []) : [];
          const list = Array.isArray(imgs) ? imgs : [];
          if (list.length > 0) {
            list.forEach((p) => toast(`Found image: ${p}`, 'info'));
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
          toast(`Searching URL: ${altUrl}`, 'info');
          try {
            const res = await fetch(altUrl, { credentials: 'include' });
            const imgs = res.ok ? await res.json().catch(() => []) : [];
            const list = Array.isArray(imgs) ? imgs : [];
            if (list.length > 0) {
              if (nm === idName && idName && idName !== primary) {
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
                  const imgs2 = res2.ok ? await res2.json().catch(() => []) : [];
                  const list2 = Array.isArray(imgs2) ? imgs2 : [];
                  if (list2.length > 0) {
                    list2.forEach((p) => toast(`Found image: ${p}`, 'info'));
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
                list.forEach((p) => toast(`Found image: ${p}`, 'info'));
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
      toast('No images found', 'info');
      setFiles([]);
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
      setFiles([]);
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
    <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
      {files.map((f, idx) => (
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
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem',
                marginTop: '1rem',
                alignContent: 'start',
              }}
            >
              {files.map((f, idx) => (
                <div key={f.path} style={{ position: 'relative', aspectRatio: '1 / 1' }}>
                  <img
                    src={f.src}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = placeholder;
                    }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
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
