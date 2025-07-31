import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../context/ToastContext.jsx';
import buildImageName from '../utils/buildImageName.js';
import AISuggestionModal from './AISuggestionModal.jsx';

export default function RowImageUploadModal({
  visible,
  onClose,
  table,
  folder,
  row = {},
  rowKey = 0,
  imagenameFields = [],
  columnCaseMap = {},
  onUploaded = () => {},
  onSuggestion = () => {},
}) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploaded, setUploaded] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestModal, setShowSuggestModal] = useState(false);
  function buildName() {
    return buildImageName(row, imagenameFields, columnCaseMap);
  }

  useEffect(() => {
    if (!visible) return;
    setFiles([]);
    setUploaded([]);
    setSuggestions([]);
    if (!folder) {
      setUploaded([]);
      return;
    }
    if (!row._saved) {
      setUploaded([]);
      return;
    }
    const { name } = buildName();
    if (!name) {
      setUploaded([]);
      return;
    }
    const safeTable = encodeURIComponent(table);
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    fetch(`/api/transaction_images/${safeTable}/${encodeURIComponent(name)}?${params.toString()}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((imgs) => setUploaded(Array.isArray(imgs) ? imgs : []))
      .catch(() => setUploaded([]));
  }, [visible, folder, rowKey, table, row._imageName, row._saved]);


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

  async function handleUpload(selectedFiles) {
    const { name: safeName, missing } = buildName();
    let finalName = `tmp_${Date.now()}`;
    if (row._saved && safeName) finalName = safeName;
    if (!folder) {
      addToast('Image folder is missing', 'error');
      return;
    }
    if (missing.length) {
      addToast(
        `Image name is missing fields: ${missing.join(', ')}. Temporary name will be used`,
        'warn',
      );
    }
    const safeTable = encodeURIComponent(table);
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    const uploadUrl = `/api/transaction_images/${safeTable}/${encodeURIComponent(finalName)}?${params.toString()}`;
    const filesToUpload = Array.from(selectedFiles || files);
    if (!filesToUpload.length) return;
    setLoading(true);
    const form = new FormData();
    filesToUpload.forEach((f) => form.append('images', f));
    let detected = [];
    try {
      const res = await fetch(uploadUrl, { method: 'POST', body: form, credentials: 'include' });
      if (res.ok) {
        const imgs = await res.json().catch(() => []);
        addToast(`Uploaded ${imgs.length} image(s) as ${finalName}`, 'success');
        setFiles([]);
        setUploaded((u) => [...u, ...imgs]);
        onUploaded(finalName);
        for (const file of filesToUpload) {
          try {
            const codeRes = await fetch(
              `/api/transaction_images/benchmark_code?name=${encodeURIComponent(file.name)}`,
              { credentials: 'include' },
            );
            if (codeRes.ok) {
              const data = await codeRes.json().catch(() => ({}));
              if (data.code) detected.push({ code: data.code, qty: data.qty });
            }
          } catch {}
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
              const count = (data.items || []).length;
              addToast(
                count ? `AI found ${count} suggestion(s)` : 'No AI suggestions',
                count ? 'success' : 'warn',
              );
              if (count) detected.push(...data.items);
            } else {
              const text = await detRes.text();
              addToast(text || 'AI detection failed', 'error');
            }
          } catch (err) {
            console.error(err);
            addToast('AI detection error: ' + err.message, 'error');
          }
        }
        if (detected.length) {
          setSuggestions((s) => [...s, ...detected]);
          setShowSuggestModal(true);
        }
      } else {
        const text = await res.text();
        addToast(text || 'Failed to upload images', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Error uploading images', 'error');
    }
    setLoading(false);
  }

  async function deleteFile(file) {
    const { name } = buildName();
    if (!folder || !name) return;
    try {
      const safeTable = encodeURIComponent(table);
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      await fetch(
        `/api/transaction_images/${safeTable}/${encodeURIComponent(name)}/${encodeURIComponent(file)}?${params.toString()}`,
        { method: 'DELETE', credentials: 'include' },
      );
      setUploaded((u) => u.filter((f) => !f.endsWith(`/${file}`)));
    } catch {}
  }

  async function deleteAll() {
    const { name } = buildName();
    if (!folder || !name) return;
    try {
      const safeTable = encodeURIComponent(table);
      const params = new URLSearchParams();
      if (folder) params.set('folder', folder);
      await fetch(`/api/transaction_images/${safeTable}/${encodeURIComponent(name)}?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setUploaded([]);
    } catch {}
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} title="Upload Images" onClose={onClose} width="auto">
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
        {loading && <span style={{ marginLeft: '0.5rem' }}>Uploading...</span>}
      </div>
      {uploaded.length > 0 && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
          {uploaded.map((src) => {
            const name = src.split('/').pop();
            return (
              <div key={src} style={{ marginBottom: '0.25rem' }}>
                <img src={src} alt="" style={{ maxWidth: '100px', marginRight: '0.5rem' }} />
                <span style={{ marginRight: '0.5rem' }}>{name}</span>
                <button type="button" onClick={() => deleteFile(name)}>Delete</button>
              </div>
            );
          })}
          <button type="button" onClick={deleteAll} style={{ marginTop: '0.5rem' }}>
            Delete All
          </button>
        </div>
      )}
      {suggestions.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          <button type="button" onClick={() => setShowSuggestModal(true)}>
            View AI Suggestions ({suggestions.length})
          </button>
        </div>
      )}
      <div style={{ textAlign: 'right', marginTop: '1rem' }}>
        <button type="button" onClick={onClose}>Close</button>
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
