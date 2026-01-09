import React, { useState, useEffect, useContext, useLayoutEffect, useRef } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import resolveImageNames from '../utils/resolveImageNames.js';
import AISuggestionModal from './AISuggestionModal.jsx';
import useGeneralConfig from '../hooks/useGeneralConfig.js';
import { useTranslation } from 'react-i18next';
import { AuthContext } from '../context/AuthContext.jsx';

export default function RowImageUploadModal({
  visible,
  onClose,
  table,
  folder,
  row = {},
  rowKey = 0,
  imagenameFields = [],
  columnCaseMap = {},
  imageIdField = '',
  zIndex = 1200,
  onUploaded = () => {},
  onSuggestion = () => {},
  forceTemporary = false,
}) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const requestRef = useRef(0);
  const generalConfig = useGeneralConfig();
  const { t } = useTranslation();
  const { company, user } = useContext(AuthContext);
  const toast = (msg, type = 'info') => {
    if (type === 'info' && !generalConfig?.general?.imageToastEnabled) return;
    addToast(msg, type);
  };
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  const isTemporary = forceTemporary || !row._saved;
  const getTemporaryImageName = (currentRow = {}) =>
    currentRow?._imageName ||
    currentRow?.imageName ||
    currentRow?.image_name ||
    '';
  function resolveNames() {
    const resolved = resolveImageNames({
      row,
      columnCaseMap,
      company,
      imagenameFields,
      imageIdField,
    });
    if (!isTemporary) return resolved;
    const temporaryName = getTemporaryImageName(row);
    return {
      ...resolved,
      primary: temporaryName,
      altNames: temporaryName ? [] : [],
      idName: '',
      imageIdFields: [],
    };
  }

  function buildTemporaryImageName() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 5);
    return `tmp_${timestamp}__${random}`;
  }

  function handleClipboardPaste(event) {
    if (!visible) return;
    const items = event.clipboardData?.items;
    if (!items || !items.length) return;
    const pastedFiles = [];
    const timestamp = Date.now();
    Array.from(items).forEach((item, idx) => {
      if (!item || !item.type?.startsWith('image/')) return;
      const file = item.getAsFile();
      if (!file) return;
      const ext = file.type?.split('/')?.[1] || 'png';
      const safeName = `pasted_${timestamp}_${idx}.${ext}`;
      let finalFile = file;
      try {
        finalFile = new File([file], safeName, { type: file.type || 'image/png' });
      } catch {
        try {
          Object.defineProperty(finalFile, 'name', { value: safeName, configurable: true });
        } catch {
          /* ignore */
        }
      }
      pastedFiles.push(finalFile);
    });
    if (!pastedFiles.length) return;
    event.preventDefault();
    setFiles((prev) => [...prev, ...pastedFiles]);
    toast(t('pasted_image_detected', 'Image pasted from clipboard'), 'info');
    handleUpload(pastedFiles);
  }

  useLayoutEffect(() => {
    if (!visible) return;
    setFiles([]);
    setUploaded([]);
    setSuggestions([]);
    setShowSuggestModal(false);
  }, [visible, rowKey, folder, table]);

  useEffect(() => {
    if (!visible) return;
    const requestId = ++requestRef.current;
    const isCurrent = () => requestRef.current === requestId;
    if (!folder) {
      if (isCurrent()) setUploaded([]);
      return;
    }
    const temporaryName = getTemporaryImageName(row);
    if (isTemporary && !temporaryName) {
      if (isCurrent()) setUploaded([]);
      return;
    }
    const { primary, altNames, idName } = resolveNames();
    const safeTable = encodeURIComponent(table);
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (company != null) params.set('companyId', company);
    (async () => {
      if (primary) {
        try {
          const res = await fetch(
            `/api/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${params.toString()}`,
            { credentials: 'include' },
          );
          const imgs = res.ok ? await res.json().catch(() => []) : [];
          const list = Array.isArray(imgs) ? imgs : [];
          if (list.length > 0 && isCurrent()) {
            setUploaded(list);
            list.forEach((p) => toast(`Found image: ${p}`, 'info'));
            return;
          }
        } catch {
          /* ignore */
        }
      }
      for (const nm of altNames) {
        try {
          const res = await fetch(
            `/api/transaction_images/${safeTable}/${encodeURIComponent(nm)}?${params.toString()}`,
            { credentials: 'include' },
          );
          const imgs = res.ok ? await res.json().catch(() => []) : [];
          const list = Array.isArray(imgs) ? imgs : [];
          if (list.length > 0) {
            if (nm === idName && primary) {
              try {
                await fetch(
                  `/api/transaction_images/${safeTable}/${encodeURIComponent(idName)}/rename/${encodeURIComponent(primary)}?${params.toString()}`,
                  { method: 'POST', credentials: 'include' },
                );
                const res2 = await fetch(
                  `/api/transaction_images/${safeTable}/${encodeURIComponent(primary)}?${params.toString()}`,
                  { credentials: 'include' },
                );
                const imgs2 = res2.ok ? await res2.json().catch(() => []) : [];
                const list2 = Array.isArray(imgs2) ? imgs2 : [];
                if (list2.length > 0 && isCurrent()) {
                  setUploaded(list2);
                  list2.forEach((p) => toast(`Found image: ${p}`, 'info'));
                  return;
                }
              } catch {
                /* ignore */
              }
            } else if (isCurrent()) {
              setUploaded(list);
              list.forEach((p) => toast(`Found image: ${p}`, 'info'));
              return;
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (isCurrent()) setUploaded([]);
    })();
  }, [
    visible,
    folder,
    rowKey,
    table,
    row._imageName,
    row._saved,
    imageIdField,
    imagenameFields,
    forceTemporary,
  ]);


  useEffect(() => {
    if (!visible) {
      setFiles([]);
      setUploaded([]);
      setSuggestions([]);
      setShowSuggestModal(false);
    }
  }, [visible]);

  useEffect(() => {
    if (suggestions.length > 0) {
      setShowSuggestModal(true);
    }
  }, [suggestions]);

  const sanitize = (value) =>
    String(value || '')
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
    const uploader = extractUploaderId(fileName);
    if (!uploader) return true;
    return normalizeEmpId(uploader) === normalizeEmpId(viewerEmpId);
  };

  async function handleUpload(selectedFiles) {
    const { primary: resolvedPrimary, missing, idName } = resolveNames();
    const safeName = isTemporary ? '' : resolvedPrimary;
    const filesToUpload = Array.from(selectedFiles || files);
    if (!filesToUpload.length) return;
    const existingTemporaryName =
      isTemporary ? getTemporaryImageName(row) : '';
    let finalName = isTemporary
      ? existingTemporaryName || buildTemporaryImageName()
      : safeName || buildTemporaryImageName();
    if (!safeName && !isTemporary && row._saved && imagenameFields.length > 0) {
      toast(
        `Image name is missing fields: ${missing.join(', ')}. Save required fields before uploading.`,
        'error',
      );
      return;
    }
    if (!isTemporary && !safeName && idName) {
      finalName = `${finalName}_${idName}`;
    }
    if (!folder) {
      toast('Image folder is missing', 'error');
      return;
    }
    if (missing.length) {
      toast(
        `Image name is missing fields: ${missing.join(', ')}. Temporary name will be used`,
        'warn',
      );
    }
    const safeTable = encodeURIComponent(table);
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    if (company != null) params.set('companyId', company);
    const uploadUrl = `/api/transaction_images/${safeTable}/${encodeURIComponent(finalName)}?${params.toString()}`;
    setLoading(true);
    const form = new FormData();
    filesToUpload.forEach((f) => form.append('images', f));
    let detected = [];
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: form, credentials: 'include' });
      if (res.ok) {
        const payload = await res.json().catch(() => []);
        const imgs = Array.isArray(payload) ? payload : payload?.files || [];
        if (generalConfig.general?.imageToastEnabled && Array.isArray(payload?.conversionIssues)) {
          payload.conversionIssues.forEach((issue) => {
            const detail = issue?.detail ? ` (${issue.detail})` : '';
            toast(
              `Sharp conversion ${issue?.reason || 'error'} for ${issue?.file || 'image'}${detail}`,
              'error',
            );
          });
        }
        toast(`Uploaded ${imgs.length} image(s) as ${finalName}`, 'success');
        setFiles([]);
        setUploaded((u) => [...u, ...imgs]);
        onUploaded(finalName);
        if (generalConfig.general?.aiInventoryApiEnabled) {
          for (const file of filesToUpload) {
            try {
              const codeRes = await fetch(
                `/api/transaction_images/benchmark_code?name=${encodeURIComponent(file.name)}${company != null ? `&companyId=${encodeURIComponent(company)}` : ''}`,
                { credentials: 'include' },
              );
            if (codeRes.ok) {
              const data = await codeRes.json().catch(() => ({}));
              if (data.code) {
                toast(`Benchmark code found: ${data.code}`, 'success');
              } else {
                toast('Benchmark code not found', 'warn');
              }
            } else {
              const text = await codeRes.text().catch(() => '');
              toast(text || 'Benchmark lookup failed', 'error');
            }
          } catch {
            toast('Benchmark lookup failed', 'error');
          }
          const detForm = new FormData();
          detForm.append('image', file);
          try {
            const detRes = await fetch('/api/ai_inventory/identify', {
              method: 'POST',
              body: detForm,
              credentials: 'include',
            });
            if (detRes.ok) {
              const data = await detRes.json();
              const items = Array.isArray(data.items) ? data.items : [];
              const count = items.length;
              if (count) {
                const list = items
                  .map((it) => `${it.code}${it.qty ? ` x${it.qty}` : ''}`)
                  .join(', ');
                toast(`AI found ${count} item(s): ${list}`, 'success');
                detected.push(...items);
              } else {
                toast('No AI suggestions', 'warn');
              }
            } else {
              const text = await detRes.text();
              toast(text || 'AI detection failed', 'error');
            }
          } catch (err) {
            console.error(err);
            toast('AI detection error: ' + err.message, 'error');
          }
        }
        if (detected.length) {
          setSuggestions((s) => [...s, ...detected]);
          setShowSuggestModal(true);
        }
        } else {
          toast('AI inventory API is disabled', 'warn');
        }
      } else {
        const text = await res.text();
        toast(text || 'Failed to upload images', 'error');
      }
    } catch (err) {
      console.error(err);
      toast(err.message || 'Error uploading images', 'error');
    }
    setLoading(false);
  }

  async function deleteFile(file) {
    if (!canDeleteFile(file)) return;
    const { primary: name } = resolveNames();
    if (!folder || !name) return;
    try {
      const safeTable = encodeURIComponent(table);
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      if (company != null) params.set('companyId', company);
      await fetch(
        `/api/transaction_images/${safeTable}/${encodeURIComponent(name)}/${encodeURIComponent(file)}?${params.toString()}`,
        { method: 'DELETE', credentials: 'include' },
      );
      setUploaded((u) => u.filter((f) => !f.endsWith(`/${file}`)));
    } catch {}
  }

  async function deleteAll() {
    const hasProtected = uploaded.some((src) => {
      const name = src.split('/').pop();
      return name && !canDeleteFile(name);
    });
    if (hasProtected) return;
    const { primary: name } = resolveNames();
    if (!folder || !name) return;
    try {
      const safeTable = encodeURIComponent(table);
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      if (company != null) params.set('companyId', company);
      await fetch(`/api/transaction_images/${safeTable}/${encodeURIComponent(name)}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setUploaded([]);
    } catch {}
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      title={t('upload_images', 'Upload Images')}
      onClose={onClose}
      width="auto"
      zIndex={zIndex}
    >
      <div
        tabIndex={0}
        onPaste={handleClipboardPaste}
        style={{
          border: '1px dashed #cbd5f5',
          padding: '0.75rem',
          marginBottom: '0.75rem',
          borderRadius: '0.25rem',
          background: '#f8fafc',
        }}
      >
        {t('paste_image_hint', 'Click here and press Ctrl+V (or Cmd+V) to paste a screenshot from your clipboard.')}
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <input
          type="file"
          multiple
          onChange={(e) => {
            const selected = Array.from(e.target.files);
            setFiles(selected);
            handleUpload(selected);
          }}
        />
        {loading && <span style={{ marginLeft: '0.5rem' }}>{t('uploading', 'Uploading...')}</span>}
      </div>
      {uploaded.length > 0 && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {uploaded.map((src) => {
            const name = src.split('/').pop();
            const allowDelete = name ? canDeleteFile(name) : false;
            return (
              <div key={src} style={{ marginBottom: '0.25rem' }}>
                <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
                <span style={{ marginRight: '0.5rem' }}>{name}</span>
                {allowDelete && (
                  <button type="button" onClick={() => deleteFile(name)}>{t('delete', 'Delete')}</button>
                )}
              </div>
            );
          })}
          {uploaded.length > 0 &&
            uploaded.every((src) => {
              const name = src.split('/').pop();
              return name ? canDeleteFile(name) : false;
            }) && (
              <button type="button" onClick={deleteAll} style={{ marginTop: '0.5rem' }}>
                {t('delete_all', 'Delete All')}
              </button>
            )}
        </div>
      )}
      {suggestions.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <button type="button" onClick={() => setShowSuggestModal(true)}>
            {t('view_ai_suggestions', 'View AI Suggestions')} ({suggestions.length})
          </button>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>{t('close', 'Close')}</button>
      </div>
      <AISuggestionModal
        visible={showSuggestModal}
        items={suggestions}
        onSelect={(it) => {
          onSuggestion(it);
          setShowSuggestModal(false);
        }}
        onClose={() => setShowSuggestModal(false)}
      />
    </Modal>
  );
}
