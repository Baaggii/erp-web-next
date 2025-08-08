
import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../context/ToastContext.jsx';

const FOLDER_STATE_KEY = 'imgMgmtFolderState';
const SESSIONS_KEY = 'imgMgmtSessions';
const SESSION_PREFIX = 'imgMgmtSession:';

// IndexedDB helpers for storing directory handles
function getHandleDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('imgMgmtHandles', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('dirs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(key, handle) {
  if (!handle) return;
  try {
    const db = await getHandleDB();
    await new Promise((res, rej) => {
      const tx = db.transaction('dirs', 'readwrite');
      tx.objectStore('dirs').put(handle, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // ignore
  }
}

async function loadDirHandle(key) {
  try {
    const db = await getHandleDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction('dirs', 'readonly');
      const req = tx.objectStore('dirs').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

async function deleteDirHandle(key) {
  try {
    const db = await getHandleDB();
    await new Promise((res, rej) => {
      const tx = db.transaction('dirs', 'readwrite');
      tx.objectStore('dirs').delete(key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // ignore
  }
}

// IndexedDB helpers for storing directory handles
function getHandleDB() {
  if (typeof indexedDB === 'undefined') return Promise.reject();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('imgMgmtHandles', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('dirs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(key, handle) {
  if (!handle) return;
  try {
    const db = await getHandleDB();
    await new Promise((res, rej) => {
      const tx = db.transaction('dirs', 'readwrite');
      tx.objectStore('dirs').put(handle, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // ignore
  }
}

async function loadDirHandle(key) {
  try {
    const db = await getHandleDB();
    return await new Promise((res, rej) => {
      const tx = db.transaction('dirs', 'readonly');
      const req = tx.objectStore('dirs').get(key);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

function extractDateFromName(name) {
  const match = typeof name === 'string' ? name.match(/(?:__|_)(\d{13})_/) : null;
  if (match) {
    const d = new Date(Number(match[1]));
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  }
  return '';
}

export default function ImageManagement() {
  const { addToast } = useToast();
  const [days, setDays] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('cleanup');
  const [pending, setPending] = useState([]);
  const [pendingPage, setPendingPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState([]);
  const [hostIgnored, setHostIgnored] = useState([]);
  const [hostIgnoredSel, setHostIgnoredSel] = useState([]);
  const [hostIgnoredPage, setHostIgnoredPage] = useState(1);
  const [uploads, setUploads] = useState([]);
  const [uploadSel, setUploadSel] = useState([]);
  const [uploadPage, setUploadPage] = useState(1);
  const [uploadPageSize, setUploadPageSize] = useState(200);
  const [ignored, setIgnored] = useState([]);
  const [ignoredPage, setIgnoredPage] = useState(1);
  const [folderName, setFolderName] = useState('');
  const [folderFiles, setFolderFiles] = useState([]);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [pendingSummary, setPendingSummary] = useState(null);
  const [pageSize, setPageSize] = useState(200);
  const detectAbortRef = useRef();
  const scanCancelRef = useRef(false);
  const renameAbortRef = useRef();
  const commitAbortRef = useRef();
  const dirHandleRef = useRef();
  const [activeOp, setActiveOp] = useState(null);
  const [report, setReport] = useState('');
  const [sessionNames, setSessionNames] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(FOLDER_STATE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          const dir = await loadDirHandle(FOLDER_STATE_KEY);
          if (dir) {
            try { await dir.requestPermission?.({ mode: 'read' }); } catch {}
            dirHandleRef.current = dir;
            data.uploads = await attachHandles(dir, data.uploads);
            data.ignored = await attachHandles(dir, data.ignored);
          }
          applySession(data);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  function stateLabel(item = {}) {
    if (item.processed) return 'Processed';
    if (item.newName) return 'New';
    return '';
  }

  async function attachHandles(dirHandle, list = []) {
    const arr = Array.isArray(list) ? list : [];
    return Promise.all(
      arr.map(async (u) => {
        try {
          const handle = await dirHandle.getFileHandle(u.originalName);
          return { ...u, handle };
        } catch {
          return u;
        }
      }),
    );
  }

  function buildSession(partial = {}) {
    const dataUploads = partial.uploads ?? uploads;
    const dataIgnored = partial.ignored ?? ignored;
    const dataPending = partial.pending ?? pending;
    const dataHostIgnored = partial.hostIgnored ?? hostIgnored;

    const mapUploads = (list = []) =>
      list
        .filter(Boolean)
        .map(
          ({
            originalName = '',
            newName = '',
            tmpPath = '',
            reason = '',
            processed,
            index,
          }) => ({
            originalName,
            newName,
            tmpPath,
            reason,
            index,
            processed: !!processed,
          }),
        );

    return {
      folderName: partial.folderName ?? (folderName || ''),
      uploads: mapUploads(dataUploads),
      ignored: mapUploads(dataIgnored),
      pending: dataPending
        .filter(Boolean)
        .map(({ currentName = '', newName = '', processed }) => ({
          currentName,
          newName,
          processed: !!processed,
        })),
      hostIgnored: dataHostIgnored
        .filter(Boolean)
        .map(({ currentName = '', reason = '', processed }) => ({
          currentName,
          reason,
          processed: !!processed,
        })),
    };
  }

  function applySession(data = {}) {
    setFolderName(data.folderName || '');
    const upArr = Array.isArray(data.uploads)
      ? data.uploads.map((u) => ({
          ...u,
          id: u.originalName,
          description: extractDateFromName(u.originalName),
          processed: !!u.processed,
          index: u.index,
        }))
      : [];
    const igArr = Array.isArray(data.ignored)
      ? data.ignored.map((u) => ({
          ...u,
          id: u.originalName,
          description: extractDateFromName(u.originalName),
          processed: !!u.processed,
          index: u.index,
        }))
      : [];
    setUploads(upArr);
    setIgnored(igArr);
    setFolderFiles(
      [...upArr, ...igArr].map((u) => ({ name: u.originalName, handle: u.handle, index: u.index })),
    );
    setPending(
      Array.isArray(data.pending)
        ? data.pending.map((u) => ({ ...u, processed: !!u.processed }))
        : [],
    );
    setHostIgnored(
      Array.isArray(data.hostIgnored)
        ? data.hostIgnored.map((u) => ({ ...u, processed: !!u.processed }))
        : [],
    );
  }

  function persistSnapshot(partial = {}) {
    try {
      const data = buildSession(partial);
      localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(data));
      saveDirHandle(FOLDER_STATE_KEY, dirHandleRef.current);
    } catch {
      // ignore
    }
  }

  function getTables() {
    return { uploads, ignored, pending, hostIgnored };
  }

  function persistAll(partial = {}) {
    const tables = getTables();
    persistSnapshot({ ...tables, folderName, ...partial });
  }

  async function saveSession() {
    try {
      const data = buildSession();
      persistAll(data);
      addToast('State saved', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save state', 'error');
    }
  }

  const uploadStart = (uploadPage - 1) * uploadPageSize;
  const pageUploads = uploads.slice(uploadStart, uploadStart + uploadPageSize);
  const uploadHasMore = uploadStart + uploadPageSize < uploads.length;
  const uploadLastPage = Math.max(1, Math.ceil(uploads.length / uploadPageSize));
  const ignoredStart = (ignoredPage - 1) * uploadPageSize;
  const pageIgnored = ignored.slice(ignoredStart, ignoredStart + uploadPageSize);
  const ignoredHasMore = ignoredStart + uploadPageSize < ignored.length;
  const ignoredLastPage = Math.max(1, Math.ceil(ignored.length / uploadPageSize));
  const hostIgnoredStart = (hostIgnoredPage - 1) * pageSize;
  const pageHostIgnored = hostIgnored.slice(hostIgnoredStart, hostIgnoredStart + pageSize);
  const hostIgnoredHasMore = hostIgnoredStart + pageSize < hostIgnored.length;
  const hostIgnoredLastPage = Math.max(1, Math.ceil(hostIgnored.length / pageSize));
  const lastPage = pendingSummary
    ? Math.max(1, Math.ceil((pendingSummary.incompleteFound || 0) / pageSize))
    : 1;

  const canRenameSelected = [...uploads, ...ignored].some(
    (u) =>
      uploadSel.includes(u.id) &&
      folderFiles[u.index]?.handle &&
      !u.processed,
  );

  const canUploadNames = [...uploads, ...ignored].some(
    (u) => uploadSel.includes(u.id) && folderFiles[u.index]?.handle && !u.processed,
  );

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    const withNew = pending
      .filter((p) => p.newName && !p.processed)
      .map((p) => p.currentName);
    const unprocessed = pending.filter((p) => !p.processed).map((p) => p.currentName);
    const all = pending.map((p) => p.currentName);
    const setEq = (arr) =>
      arr.length === selected.length && arr.every((id) => selected.includes(id));
    if (withNew.length === 0) {
      if (setEq(all)) setSelected([]);
      else if (setEq(unprocessed)) setSelected(all);
      else setSelected(unprocessed);
      return;
    }
    if (setEq(withNew)) setSelected(unprocessed);
    else if (setEq(unprocessed)) setSelected(all);
    else if (setEq(all)) setSelected([]);
    else setSelected(withNew);
  }

  function toggleHostIgnored(id) {
    setHostIgnoredSel((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleHostIgnoredAll(list) {
    const allIds = list.map((p) => p.currentName);
    const unprocessedIds = list.filter((p) => !p.processed).map((p) => p.currentName);
    const newIds = list
      .filter((p) => p.newName && !p.processed)
      .map((p) => p.currentName);
    const current = hostIgnoredSel.filter((id) => allIds.includes(id));
    const setEq = (arr) => arr.length === current.length && arr.every((id) => current.includes(id));
    const removePage = (prev) => prev.filter((id) => !allIds.includes(id));
    if (newIds.length === 0) {
      if (setEq(allIds)) setHostIgnoredSel(removePage);
      else if (setEq(unprocessedIds))
        setHostIgnoredSel((prev) => [...removePage(prev), ...allIds.filter((id) => !prev.includes(id))]);
      else setHostIgnoredSel((prev) => [...removePage(prev), ...unprocessedIds.filter((id) => !prev.includes(id))]);
      return;
    }
    if (setEq(newIds))
      setHostIgnoredSel((prev) => [...removePage(prev), ...unprocessedIds.filter((id) => !prev.includes(id))]);
    else if (setEq(unprocessedIds))
      setHostIgnoredSel((prev) => [...removePage(prev), ...allIds.filter((id) => !prev.includes(id))]);
    else if (setEq(allIds)) setHostIgnoredSel(removePage);
    else
      setHostIgnoredSel((prev) => [...removePage(prev), ...newIds.filter((id) => !prev.includes(id))]);
  }

  function toggleUpload(id) {
    setUploadSel((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleUploadAll(list) {
    const allIds = list.map((u) => u.id);
    const unprocessedIds = list.filter((u) => !u.processed).map((u) => u.id);
    const newIds = list.filter((u) => u.newName && !u.processed).map((u) => u.id);
    const current = uploadSel.filter((id) => allIds.includes(id));
    const setEq = (arr) => arr.length === current.length && arr.every((id) => current.includes(id));
    const removePage = (prev) => prev.filter((id) => !allIds.includes(id));
    if (newIds.length === 0) {
      if (setEq(allIds)) setUploadSel(removePage);
      else if (setEq(unprocessedIds))
        setUploadSel((prev) => [...removePage(prev), ...allIds.filter((id) => !prev.includes(id))]);
      else setUploadSel((prev) => [...removePage(prev), ...unprocessedIds.filter((id) => !prev.includes(id))]);
      return;
    }
    if (setEq(newIds))
      setUploadSel((prev) => [...removePage(prev), ...unprocessedIds.filter((id) => !prev.includes(id))]);
    else if (setEq(unprocessedIds))
      setUploadSel((prev) => [...removePage(prev), ...allIds.filter((id) => !prev.includes(id))]);
    else if (setEq(allIds)) setUploadSel(removePage);
    else setUploadSel((prev) => [...removePage(prev), ...newIds.filter((id) => !prev.includes(id))]);
  }

  useEffect(() => {
    function onKey(e) {
      const key = e.key.toLowerCase();
      if (key === 'escape' && activeOp) {
        const labels = {
          detect: 'detection',
          folder: 'folder selection',
          rename: 'rename',
          commit: 'upload commit',
        };
        const action = labels[activeOp] || 'operation';
        if (window.confirm(`Cancel ${action}?`)) {
          switch (activeOp) {
            case 'detect':
              detectAbortRef.current?.abort();
              break;
            case 'folder':
              scanCancelRef.current = true;
              break;
            case 'rename':
              renameAbortRef.current?.abort();
              break;
            case 'commit':
              commitAbortRef.current?.abort();
              break;
            default:
              break;
          }
          setActiveOp(null);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        const allIds = [...uploads, ...ignored].map((u) => u.id);
        setUploadSel((prev) => (prev.length === allIds.length ? [] : allIds));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault();
        setUploadSel([]);
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeOp, uploads, ignored]);

  async function selectFolder() {
    if (!window.showDirectoryPicker) {
      addToast('Directory selection not supported', 'error');
      return;
    }
    setActiveOp('folder');
    scanCancelRef.current = false;
    try {
      const dirHandle = await window.showDirectoryPicker();
      dirHandleRef.current = dirHandle;
      const handlePath = dirHandle?.path || dirHandle?.name || '';
      setFolderName(handlePath);
      const files = [];
      for await (const entry of dirHandle.values()) {
        if (scanCancelRef.current) break;
        if (entry.kind === 'file') {
          files.push({ name: entry.name, handle: entry, index: files.length });
        }
      }
      const names = files.map((f) => f.name);
      if (scanCancelRef.current) return;
      const chunkSize = 200;
      let all = [];
      let skipped = [];
      let processed = 0;
      for (let i = 0; i < names.length; i += chunkSize) {
        if (scanCancelRef.current) return;
        let res;
        try {
          res = await fetch('/api/transaction_images/upload_scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ names: names.slice(i, i + chunkSize) }),
          });
        } catch {
          addToast('Folder scan failed', 'error');
          return;
        }
        if (!res.ok) {
          addToast('Folder scan failed', 'error');
          return;
        }
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.list) ? data.list : [];
        const miss = Array.isArray(data.skipped) ? data.skipped : [];
        processed += data?.summary?.processed || 0;
        all = all.concat(list);
        skipped = skipped.concat(miss);
      }
      if (scanCancelRef.current) return;
      addToast(`Folder loaded: ${handlePath}`, 'success');
      const sorted = all.slice().sort((a, b) => a.originalName.localeCompare(b.originalName));
      const uploadsList = sorted.map((u) => {
        const f = files.find((p) => p.name === u.originalName);
        return {
          originalName: u.originalName,
          id: u.originalName,
          handle: f?.handle,
          index: f?.index,
          description: extractDateFromName(u.originalName),
          processed: false,
        };
      });
      setUploads(uploadsList);
      const skippedSorted = skipped
        .slice()
        .sort((a, b) => a.originalName.localeCompare(b.originalName));
      const ignoredList = skippedSorted.map((u) => {
        const f = files.find((p) => p.name === u.originalName);
        return {
          originalName: u.originalName,
          id: u.originalName,
          handle: f?.handle,
          index: f?.index,
          reason: u.reason,
          processed: false,
        };
      });
      setIgnored(ignoredList);
      setFolderFiles(files);
      setUploadSummary({ totalFiles: names.length, processed, unflagged: skipped.length });
      setUploadSel([]);
      setUploadPage(1);
      setIgnoredPage(1);
      setReport(
        `Scanned ${names.length} file(s), found ${processed} incomplete name(s), ${skipped.length} unflagged.`,
      );
      persistAll({
        uploads: uploadsList,
        ignored: ignoredList,
        folderName: handlePath,
        pending: [],
        hostIgnored: [],
      });
    } catch {
      // ignore
    } finally {
      scanCancelRef.current = false;
      setActiveOp(null);
    }
  }

  async function handleCleanup() {
    const path = days ? `/api/transaction_images/cleanup/${days}` : '/api/transaction_images/cleanup';
    try {
      const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const removed = data.removed || 0;
        setResult(removed);
        addToast(`Removed ${removed} file(s)`, 'success');
      } else {
        addToast('Cleanup failed', 'error');
      }
    } catch {
      addToast('Cleanup failed', 'error');
    }
  }

  async function detectFromHost(p = pendingPage) {
    const controller = new AbortController();
    detectAbortRef.current = controller;
    setActiveOp('detect');
    try {
      const res = await fetch(`/api/transaction_images/detect_incomplete?page=${p}&pageSize=${pageSize}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.list)
          ? data.list
              .slice()
              .sort((a, b) => a.currentName.localeCompare(b.currentName))
              .map((p) => ({ ...p, description: extractDateFromName(p.currentName) }))
          : [];
        const miss = Array.isArray(data.skipped)
          ? data.skipped
              .slice()
              .sort((a, b) => a.currentName.localeCompare(b.currentName))
              .map((p) => ({
                ...p,
                description: extractDateFromName(p.currentName),
              }))
          : [];
        setPending(list);
        setHostIgnored(miss);
        setHostIgnoredPage(1);
        setPendingSummary(data.summary || null);
        setHasMore(!!data.hasMore);
        setSelected([]);
        setHostIgnoredSel([]);
        const sum = data.summary || {};
        setReport(
          `Scanned ${sum.totalFiles || 0} file(s), found ${sum.incompleteFound || 0} incomplete name(s), ${sum.skipped || 0} not incomplete.`,
        );
        persistAll({
          uploads,
          ignored,
          folderName,
          pending: list,
          hostIgnored: miss,
        });
      } else {
        setPending([]);
        setHostIgnored([]);
        setHostIgnoredPage(1);
        setPendingSummary(null);
        setHasMore(false);
        persistAll({ uploads, ignored, folderName, pending: [], hostIgnored: [] });
      }
      setPendingPage(p);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setPending([]);
        setHostIgnored([]);
        setHostIgnoredPage(1);
        setPendingSummary(null);
        setHasMore(false);
        persistAll({ uploads, ignored, folderName, pending: [], hostIgnored: [] });
      }
    } finally {
      detectAbortRef.current = null;
      setActiveOp(null);
    }
      setPendingPage(p);
  }

  async function applyFixesSelection(list, sel) {
    const items = list.filter((p) => sel.includes(p.currentName) && !p.processed);
    if (items.length === 0) return;
    const res = await fetch('/api/transaction_images/fix_incomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ list: items }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      addToast(`Renamed ${data.fixed || 0} file(s)`, 'success');
      setReport(`Renamed ${data.fixed || 0} file(s)`);
      await detectFromHost(pendingPage);
    } else {
      addToast('Rename failed', 'error');
    }
  }

  async function applyFixes() {
    await applyFixesSelection(pending, selected);
  }

  async function applyFixesHostIgnored() {
    await applyFixesSelection(hostIgnored, hostIgnoredSel);
  }

  async function renameSelectedNames() {
    if (uploadSel.length === 0) {
      addToast('No files selected', 'error');
      return;
    }
    const items = [...uploads, ...ignored].filter(
      (u) => uploadSel.includes(u.id) && !u.processed,
    );
    if (items.length === 0) {
      addToast('No files to rename', 'error');
      return;
    }
    try {
      const idxMap = new Map();
      const payload = items.map((u, i) => {
        const idx = typeof u.index === 'number' ? u.index : i;
        idxMap.set(u.id, idx);
        return { name: u.originalName, index: idx };
      });
      const res = await fetch('/api/transaction_images/upload_check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ names: payload }),
      });
      if (!res.ok) throw new Error('bad response');
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data.list) ? data.list : [];
      const resultMap = new Map(list.map((r) => [String(r.index), r]));
      const updateList = (arr) =>
        arr
          .map((u) => {
            if (!uploadSel.includes(u.id)) return u;
            const idx = idxMap.get(u.id);
            const r = resultMap.get(String(idx));
            if (!r) {
              const reason = u.reason || 'No match found';
              return { ...u, reason, description: reason };
            }
            if (!r.newName) {
              const reason = r.reason || 'No match found';
              return { ...u, reason, description: reason };
            }
            const desc = r.reason && !r.tmpPath
              ? r.reason
              : extractDateFromName(r.newName);
            return {
              ...u,
              newName: r.newName,
              folder: r.folder,
              folderDisplay: r.folderDisplay,
              tmpPath: r.tmpPath,
              processed: !!r.processed,
              reason: r.reason,
              description: desc,
            };
          })
          .sort((a, b) => a.originalName.localeCompare(b.originalName));
      const newUploads = updateList(uploads);
      const newIgnored = updateList(ignored);
      const processedCount = list.filter((m) => m.newName).length;
      const skipCount = items.length - processedCount;
      if (processedCount) addToast(`Renamed ${processedCount} file(s)`, 'success');
      else addToast('No files renamed', 'warning');
      if (skipCount) addToast(`Skipped ${skipCount} file(s)`, 'warning');
      setUploads(newUploads);
      setIgnored(newIgnored);
      setUploadSel([]);
      persistAll({ uploads: newUploads, ignored: newIgnored });
      setReport(`Renamed ${processedCount} file(s)`);
    } catch {
      addToast('Rename failed', 'error');
    }
  }

  async function uploadRenamedNames() {
    if (uploadSel.length === 0) {
      addToast('No files selected', 'error');
      return;
    }
    const all = [...uploads, ...ignored];
    const selectedItems = all.filter(
      (u) => uploadSel.includes(u.id) && !u.processed && folderFiles[u.index]?.handle,
    );
    if (selectedItems.length === 0) {
      addToast('No local files to upload', 'error');
      return;
    }
    const toRename = selectedItems.filter((u) => !u.tmpPath).map((u) => u.id);
    let processedCount = 0;
    let skipCount = 0;
    if (toRename.length) {
      const merged = await renameSelected(toRename, { keepSelection: true, silent: true });
      processedCount = merged.filter((r) => r.newName).length;
      skipCount = toRename.length - processedCount;
      if (processedCount) addToast(`Renamed ${processedCount} file(s)`, 'success');
      else addToast('No files renamed', 'warning');
      if (skipCount) addToast(`Skipped ${skipCount} file(s)`, 'warning');
    }
    const tables = getTables();
    const readyItems = Object.values(tables)
      .flat()
      .filter((u) => uploadSel.includes(u.id) && u.tmpPath && !u.processed);
    if (readyItems.length === 0) {
      addToast('No files ready to upload', 'error');
      return;
    }
    const readyIds = readyItems.map((u) => u.id);
    const uploaded = await commitUploads(readyIds, { silent: true });
    if (uploaded) addToast(`Uploaded ${uploaded} file(s)`, 'success');
    if (readyIds.length > uploaded)
      addToast(`Failed to upload ${readyIds.length - uploaded} file(s)`, 'error');
    setReport(`Uploaded ${uploaded || 0} file(s)`);
  }

  async function renameSelected(
    selectedIds = uploadSel,
    { keepSelection = false, silent = false } = {},
  ) {
    if (selectedIds && selectedIds.preventDefault) selectedIds = uploadSel;
    if (activeOp === 'rename') {
      if (window.confirm('Cancel rename?')) {
        renameAbortRef.current?.abort();
        setActiveOp(null);
      }
      return;
    }

    if (selectedIds.length === 0) {
      if (!silent) addToast('No files selected', 'error');
      return;
    }

    const items = [...uploads, ...ignored].filter(
      (u) => selectedIds.includes(u.id) && !u.processed,
    );
    if (items.length === 0) {
      if (!silent) addToast('No local files to rename', 'error');
      return;
    }

    const controller = new AbortController();
    renameAbortRef.current = controller;
    setActiveOp('rename');

    let merged = [];
    let skipped = 0;

    try {
      const sendItems = [];
      for (const u of items) {
        const f = folderFiles[u.index];
        if (!f?.handle) {
          if (!silent) addToast(`Missing local file: ${u.originalName}`, 'error');
          merged.push({ index: u.index, reason: 'Missing local file' });
          continue;
        }
        try {
          const file = await f.handle.getFile();
          sendItems.push({ u, file });
        } catch {
          if (!silent) addToast(`Missing local file: ${u.originalName}`, 'error');
          merged.push({ index: u.index, reason: 'Missing local file' });
        }
      }

      async function uploadBatch(list) {
        if (controller.signal.aborted || list.length === 0) return;
        const formData = new FormData();
        for (const { u, file } of list) {
          formData.append('images', file, u.originalName);
          formData.append(
            'meta',
            JSON.stringify({
              index: u.index,
              originalName: u.originalName,
              rowId: u.rowId,
              transType: u.transType,
            }),
          );
        }
        try {
          const res = await fetch('/api/transaction_images/upload_check', {
            method: 'POST',
            body: formData,
            credentials: 'include',
            signal: controller.signal,
          });
          if (!res.ok) throw new Error('bad response');
          const data = await res.json().catch(() => ({}));
          const list = Array.isArray(data.list) ? data.list : null;
          if (!list) throw new Error('no list');
          for (const r of list) {
            if (typeof r.index === 'undefined') throw new Error('bad item');
          }
          merged = merged.concat(list);
        } catch {
          if (list.length === 1) {
            if (!silent) addToast('Rename failed', 'error');
            merged.push({ index: list[0].u.index, reason: 'Rename failed' });
          } else {
            const mid = Math.floor(list.length / 2);
            await uploadBatch(list.slice(0, mid));
            await uploadBatch(list.slice(mid));
          }
        }
      }

      await uploadBatch(sendItems);

      if (controller.signal.aborted) {
        if (!silent) addToast('Rename canceled', 'info');
        return;
      }

      const resultMap = new Map(merged.map((r) => [String(r.index), r]));
      const updateList = (arr) =>
        arr
          .map((u) => {
            if (!selectedIds.includes(u.id)) return u;
            const r = resultMap.get(String(u.index));
            if (!r) {
              const reason = u.reason || 'No match found';
              return { ...u, reason, description: reason };
            }
            if (!r.newName) {
              const reason = r.reason || 'No match found';
              return { ...u, reason, description: reason };
            }
            const desc = r.reason && !r.tmpPath
              ? r.reason
              : extractDateFromName(r.newName);
            return {
              ...u,
              newName: r.newName,
              folder: r.folder,
              folderDisplay: r.folderDisplay,
              tmpPath: r.tmpPath,
              processed: !!r.processed,
              reason: r.reason,
              description: desc,
            };
          })
          .sort((a, b) => a.originalName.localeCompare(b.originalName));

      const newUploads = updateList(uploads);
      const newIgnored = updateList(ignored);

      const processedCount = merged.filter((m) => m.newName).length;
      const skipCount = items.length - processedCount;
      if (!silent) {
        if (processedCount) addToast(`Renamed ${processedCount} file(s)`, 'success');
        else addToast('No files renamed', 'warning');
        if (skipCount) addToast(`Skipped ${skipCount} file(s)`, 'warning');
      }

      setUploads(newUploads);
      setIgnored(newIgnored);
      if (!keepSelection)
        setUploadSel((prev) => prev.filter((id) => !selectedIds.includes(id)));
      persistAll({ uploads: newUploads, ignored: newIgnored });
      setReport(`Renamed ${processedCount} file(s)`);
    } catch {
      if (controller.signal.aborted) {
        if (!silent) addToast('Rename canceled', 'info');
      } else {
        if (!silent) addToast('Rename failed', 'error');
        merged = merged.concat(
          items.map((u) => ({ index: u.index, reason: 'Rename failed' })),
        );
        const resultMap = new Map(merged.map((r) => [String(r.index), r]));
        const updateList = (arr) =>
          arr.map((u) => {
            if (!selectedIds.includes(u.id)) return u;
            const r = resultMap.get(String(u.index));
            const reason = r?.reason || u.reason || 'Rename failed';
            return { ...u, reason, description: reason };
          });
        setUploads(updateList(uploads));
        setIgnored(updateList(ignored));
      }
    } finally {
      persistAll({ uploads, ignored });
      setActiveOp(null);
    }
    const idMap = new Map(items.map((u) => [String(u.index), u.id]));
    return merged.map((r) => ({ ...r, id: idMap.get(String(r.index)) }));
  }

  async function commitUploads(selectedIds = uploadSel, { silent = false } = {}) {
    if (selectedIds && selectedIds.preventDefault) selectedIds = uploadSel;
    if (activeOp === 'commit') {
      if (window.confirm('Cancel upload commit?')) {
        commitAbortRef.current?.abort();
        setActiveOp(null);
      }
      return 0;
    }

    const tables = getTables();
    const allItems = Object.values(tables).flat();
    const items = allItems.filter(
      (u) => selectedIds.includes(u.id) && u.tmpPath && !u.processed,
    );
    if (items.length === 0) return 0;

    const controller = new AbortController();
    commitAbortRef.current = controller;
    setActiveOp('commit');

    try {
      const res = await fetch('/api/transaction_images/upload_commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list: items }),
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!silent) addToast(`Uploaded ${data.uploaded || 0} file(s)`, 'success');
        const updated = {};
        for (const [key, arr] of Object.entries(tables)) {
          updated[key] = arr.map((u) =>
            selectedIds.includes(u.id) && u.tmpPath ? { ...u, processed: true } : u,
          );
        }
        setUploads(updated.uploads);
        setIgnored(updated.ignored);
        setPending(updated.pending);
        setHostIgnored(updated.hostIgnored);
        setUploadSel((prev) => prev.filter((id) => !selectedIds.includes(id)));
        persistAll(updated);
        if (!silent) setReport(`Uploaded ${data.uploaded || 0} file(s)`);
        return data.uploaded || 0;
      }
      if (!silent) addToast('Upload failed', 'error');
      return 0;
    } catch {
      if (controller.signal.aborted) {
        if (!silent) addToast('Upload canceled', 'info');
      } else if (!silent) addToast('Upload failed', 'error');
      return 0;
    } finally {
      setActiveOp(null);
    }
  }

  return (
    <div>
      <h2>Image Management</h2>
      <div className="tab-button-group" style={{ marginBottom: '0.5rem' }}>
        <button className={`tab-button ${tab === 'cleanup' ? 'active' : ''}`} onClick={() => setTab('cleanup')}>
          Cleanup
        </button>
        <button className={`tab-button ${tab === 'fix' ? 'active' : ''}`} onClick={() => setTab('fix')}>
          Fix Names
        </button>
      </div>
      {tab === 'cleanup' ? (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <label>
              Cleanup files older than (days):{' '}
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                style={{ width: '4rem' }}
              />
            </label>
            <button type="button" onClick={handleCleanup} style={{ marginLeft: '0.5rem' }}>
              Cleanup
            </button>
          </div>
          {result !== null && <p>{result} file(s) removed.</p>}
        </div>
      ) : (
        <div>
          {report && (
            <p style={{ color: 'red', marginBottom: '0.5rem' }}>{report}</p>
          )}
          <div style={{ marginBottom: '0.5rem' }}>
            <button type="button" onClick={selectFolder} style={{ marginRight: '0.5rem' }}>
              Select Folder
            </button>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Selected folder"
              style={{ marginRight: '0.5rem' }}
            />
            <button type="button" onClick={saveSession} style={{ marginRight: '0.5rem' }}>
              Save
            </button>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              style={{ marginRight: '0.5rem' }}
            >
              <option value="">Select session</option>
              {sessionNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => loadSession()} disabled={!selectedSession} style={{ marginRight: '0.5rem' }}>
              Load
            </button>
            <button type="button" onClick={() => deleteSession()} disabled={!selectedSession}>
              Delete
            </button>
          </div>
          {uploadSummary && (
            <p style={{ marginBottom: '0.5rem' }}>
              {`Scanned ${uploadSummary.totalFiles || 0} file(s), found ${uploadSummary.processed || 0} incomplete name(s), ${uploadSummary.unflagged || 0} unflagged.`}
            </p>
          )}
          {(uploads.length > 0 || ignored.length > 0) && (
            <div style={{ marginBottom: '1rem' }}>
              <h4>Uploads</h4>
              <button
                type="button"
                onClick={renameSelected}
                style={{ marginBottom: '0.5rem', marginRight: '0.5rem' }}
                disabled={!canRenameSelected}
              >
                Rename Selected
              </button>
              <button
                type="button"
                onClick={uploadRenamedNames}
                style={{
                  marginBottom: '0.5rem',
                  marginRight: '0.5rem',
                  float: 'right',
                }}
                disabled={!canUploadNames}
              >
                Upload Names
              </button>
              <button
                type="button"
                onClick={renameSelectedNames}
                style={{
                  marginBottom: '0.5rem',
                  marginRight: '0.5rem',
                  float: 'right',
                }}
                disabled={uploadSel.length === 0}
              >
                Rename Names
              </button>
              <button
                type="button"
                onClick={commitUploads}
                style={{ marginBottom: '0.5rem', marginRight: '0.5rem' }}
                disabled={
                  uploadSel.length === 0 ||
                  ![...uploads, ...ignored].some((u) => uploadSel.includes(u.id) && u.tmpPath)
                }
              >
                Upload Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  const remainingUploads = uploads.filter((u) => !uploadSel.includes(u.id));
                  const remainingIgnored = ignored.filter((u) => !uploadSel.includes(u.id));
                  setUploads(remainingUploads);
                  setIgnored(remainingIgnored);
                  setUploadSel([]);
                  setReport(`Deleted ${uploadSel.length} file(s)`);
                  persistAll({ uploads: remainingUploads, ignored: remainingIgnored });
                }}
                style={{ marginBottom: '0.5rem', marginRight: '0.5rem' }}
                disabled={uploadSel.length === 0}
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={renameSelectedNames}
                style={{
                  marginBottom: '0.5rem',
                  marginLeft: '1rem',
                  marginRight: '0.5rem',
                }}
                disabled={uploadSel.length === 0}
              >
                Rename Names
              </button>
              <button
                type="button"
                onClick={uploadRenamedNames}
                style={{ marginBottom: '0.5rem', marginRight: '0.5rem' }}
                disabled={!canUploadNames}
              >
                Upload Names
              </button>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ marginRight: '0.5rem' }}>
                  Page Size:{' '}
                  <input
                    type="number"
                    value={uploadPageSize}
                    onChange={(e) => {
                      setUploadPageSize(Number(e.target.value));
                      setUploadPage(1);
                      setIgnoredPage(1);
                    }}
                    style={{ width: '4rem' }}
                  />
                </label>
              </div>
              {uploads.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      disabled={uploadPage === 1}
                      onClick={() => setUploadPage(1)}
                      style={{ marginRight: '0.5rem' }}
                    >
                      First
                    </button>
                    <button
                      type="button"
                      disabled={uploadPage === 1}
                      onClick={() => setUploadPage(uploadPage - 1)}
                      style={{ marginRight: '0.5rem' }}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={!uploadHasMore}
                      onClick={() => setUploadPage(uploadPage + 1)}
                      style={{ marginRight: '0.5rem' }}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      disabled={uploadPage === uploadLastPage}
                      onClick={() => setUploadPage(uploadLastPage)}
                    >
                      Last
                    </button>
                  </div>
                  <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th className="border px-2 py-1">
                          <input
                            type="checkbox"
                            checked={pageUploads.length > 0 && pageUploads.every((u) => uploadSel.includes(u.id))}
                            onChange={() => toggleUploadAll(pageUploads)}
                          />
                        </th>
                        <th className="border px-2 py-1">Original</th>
                        <th className="border px-2 py-1">New Name</th>
                        <th className="border px-2 py-1">Folder</th>
                        <th className="border px-2 py-1">Description</th>
                        <th className="border px-2 py-1">State</th>
                        <th className="border px-2 py-1">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageUploads.map((u) => (
                        <tr key={u.id} className={uploadSel.includes(u.id) ? 'bg-blue-50' : ''}>
                          <td className="border px-2 py-1 text-center">
                            <input type="checkbox" checked={uploadSel.includes(u.id)} onChange={() => toggleUpload(u.id)} />
                          </td>
                          <td className="border px-2 py-1">{u.originalName}</td>
                          <td className="border px-2 py-1">{u.newName}</td>
                          <td className="border px-2 py-1">{u.folderDisplay}</td>
                          <td className="border px-2 py-1">{u.description}</td>
                          <td className="border px-2 py-1">{stateLabel(u)}</td>
                          <td className="border px-2 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const remainingUploads = uploads.filter((x) => x.id !== u.id);
                                setUploads(remainingUploads);
                                setUploadSel((s) => s.filter((id) => id !== u.id));
                                persistAll({ uploads: remainingUploads, ignored });
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {ignored.length > 0 && (
                <div>
                  <h4>Not Incomplete</h4>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <button
                      type="button"
                      disabled={ignoredPage === 1}
                      onClick={() => setIgnoredPage(1)}
                      style={{ marginRight: '0.5rem' }}
                    >
                      First
                    </button>
                    <button
                      type="button"
                      disabled={ignoredPage === 1}
                      onClick={() => setIgnoredPage(ignoredPage - 1)}
                      style={{ marginRight: '0.5rem' }}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={!ignoredHasMore}
                      onClick={() => setIgnoredPage(ignoredPage + 1)}
                      style={{ marginRight: '0.5rem' }}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      disabled={ignoredPage === ignoredLastPage}
                      onClick={() => setIgnoredPage(ignoredLastPage)}
                    >
                      Last
                    </button>
                  </div>
                  <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                    <thead>
                      <tr>
                        <th className="border px-2 py-1">
                          <input
                            type="checkbox"
                            checked={pageIgnored.length > 0 && pageIgnored.every((u) => uploadSel.includes(u.id))}
                            onChange={() => toggleUploadAll(pageIgnored)}
                          />
                        </th>
                        <th className="border px-2 py-1">Original</th>
                        <th className="border px-2 py-1">New Name</th>
                        <th className="border px-2 py-1">Folder</th>
                        <th className="border px-2 py-1">Description</th>
                        <th className="border px-2 py-1">State</th>
                        <th className="border px-2 py-1">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageIgnored.map((u) => (
                        <tr key={u.id} className={uploadSel.includes(u.id) ? 'bg-blue-50' : ''}>
                          <td className="border px-2 py-1 text-center">
                            <input type="checkbox" checked={uploadSel.includes(u.id)} onChange={() => toggleUpload(u.id)} />
                          </td>
                          <td className="border px-2 py-1">{u.originalName}</td>
                          <td className="border px-2 py-1">{u.newName}</td>
                          <td className="border px-2 py-1">{u.folderDisplay}</td>
                          <td className="border px-2 py-1">{u.reason}</td>
                          <td className="border px-2 py-1">{stateLabel(u)}</td>
                          <td className="border px-2 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const remainingIgnored = ignored.filter((x) => x.id !== u.id);
                                setIgnored(remainingIgnored);
                                setUploadSel((s) => s.filter((id) => id !== u.id));
                                persistAll({ uploads, ignored: remainingIgnored });
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div style={{ marginBottom: '0.5rem', marginTop: '1rem' }}>
            <button type="button" onClick={() => detectFromHost(1)} style={{ marginRight: '0.5rem' }}>
              Detect from host
            </button>
            <label style={{ marginRight: '0.5rem' }}>
              Page Size:{' '}
              <input
                type="number"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                style={{ width: '4rem' }}
              />
            </label>
            <button
              type="button"
              disabled={pendingPage === 1}
              onClick={() => detectFromHost(1)}
              style={{ marginRight: '0.5rem' }}
            >
              First
            </button>
            <button
              type="button"
              disabled={pendingPage === 1}
              onClick={() => detectFromHost(pendingPage - 1)}
              style={{ marginRight: '0.5rem' }}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={!hasMore}
              onClick={() => detectFromHost(pendingPage + 1)}
              style={{ marginRight: '0.5rem' }}
            >
              Next
            </button>
            <button
              type="button"
              disabled={pendingPage === lastPage}
              onClick={() => detectFromHost(lastPage)}
            >
              Last
            </button>
          </div>
          {pendingSummary && (
            <p style={{ marginBottom: '0.5rem' }}>
              {`Scanned ${pendingSummary.totalFiles || 0} file(s) in ${pendingSummary.folders?.length || 0} folder(s)`}
              {pendingSummary.folders?.length ? ` (${pendingSummary.folders.join(', ')})` : ''}
              {`. Found ${pendingSummary.incompleteFound || 0} incomplete name(s), displaying ${pendingSummary.processed || 0}.`}
            </p>
          )}
          {pending.length === 0 ? (
            <p>No incomplete names found.</p>
          ) : (
            <div>
              <button
                type="button"
                onClick={applyFixes}
                style={{ marginBottom: '0.5rem' }}
                disabled={selected.length === 0}
              >
                Rename &amp; Move Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  setPending((prev) => prev.filter((p) => !selected.includes(p.currentName)));
                  setSelected([]);
                  persistAll({ uploads, ignored, folderName, pending: remaining, hostIgnored });
                }}
                style={{ marginBottom: '0.5rem', marginLeft: '0.5rem' }}
                disabled={selected.length === 0}
              >
                Delete Selected
              </button>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input type="checkbox" checked={selected.length === pending.length && pending.length > 0} onChange={toggleAll} />
                    </th>
                    <th className="border px-2 py-1">Current</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                    <th className="border px-2 py-1">Description</th>
                    <th className="border px-2 py-1">State</th>
                    <th className="border px-2 py-1">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((p) => (
                    <tr key={p.currentName} className={selected.includes(p.currentName) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input type="checkbox" checked={selected.includes(p.currentName)} onChange={() => toggle(p.currentName)} />
                      </td>
                      <td className="border px-2 py-1">{p.currentName}</td>
                      <td className="border px-2 py-1">{p.newName}</td>
                      <td className="border px-2 py-1">{p.folderDisplay}</td>
                      <td className="border px-2 py-1">{p.description}</td>
                      <td className="border px-2 py-1">{stateLabel(p)}</td>
                      <td className="border px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setPending((prev) => prev.filter((x) => x.currentName !== p.currentName));
                            setSelected((s) => s.filter((id) => id !== p.currentName));
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hostIgnored.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Not Incomplete</h4>
              <button
                type="button"
                onClick={applyFixesHostIgnored}
                style={{ marginBottom: '0.5rem' }}
                disabled={hostIgnoredSel.length === 0}
              >
                Rename &amp; Move Selected
              </button>
              <button
                type="button"
                onClick={() => {
                  setHostIgnored((prev) => prev.filter((p) => !hostIgnoredSel.includes(p.currentName)));
                  setHostIgnoredSel([]);
                  persistAll({ uploads, ignored, folderName, pending, hostIgnored: remaining });
                }}
                style={{ marginBottom: '0.5rem', marginLeft: '0.5rem' }}
                disabled={hostIgnoredSel.length === 0}
              >
                Delete Selected
              </button>
              <div style={{ marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  disabled={hostIgnoredPage === 1}
                  onClick={() => setHostIgnoredPage(1)}
                  style={{ marginRight: '0.5rem' }}
                >
                  First
                </button>
                <button
                  type="button"
                  disabled={hostIgnoredPage === 1}
                  onClick={() => setHostIgnoredPage(hostIgnoredPage - 1)}
                  style={{ marginRight: '0.5rem' }}
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={!hostIgnoredHasMore}
                  onClick={() => setHostIgnoredPage(hostIgnoredPage + 1)}
                  style={{ marginRight: '0.5rem' }}
                >
                  Next
                </button>
                <button
                  type="button"
                  disabled={hostIgnoredPage === hostIgnoredLastPage}
                  onClick={() => setHostIgnoredPage(hostIgnoredLastPage)}
                >
                  Last
                </button>
              </div>
              <table className="min-w-full border border-gray-300 text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="border px-2 py-1">
                      <input
                        type="checkbox"
                        checked={
                          pageHostIgnored.length > 0 &&
                          pageHostIgnored.every((p) => hostIgnoredSel.includes(p.currentName))
                        }
                        onChange={() => toggleHostIgnoredAll(pageHostIgnored)}
                      />
                    </th>
                    <th className="border px-2 py-1">Original</th>
                    <th className="border px-2 py-1">New Name</th>
                    <th className="border px-2 py-1">Folder</th>
                    <th className="border px-2 py-1">Description</th>
                    <th className="border px-2 py-1">State</th>
                    <th className="border px-2 py-1">Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {pageHostIgnored.map((p) => (
                    <tr key={p.currentName} className={hostIgnoredSel.includes(p.currentName) ? 'bg-blue-50' : ''}>
                      <td className="border px-2 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={hostIgnoredSel.includes(p.currentName)}
                          onChange={() => toggleHostIgnored(p.currentName)}
                        />
                      </td>
                      <td className="border px-2 py-1">{p.currentName}</td>
                      <td className="border px-2 py-1">{p.newName}</td>
                      <td className="border px-2 py-1">{p.folderDisplay}</td>
                      <td className="border px-2 py-1">
                        {p.description}
                        {p.description && p.reason ? ' - ' : ''}
                        {p.reason}
                      </td>
                      <td className="border px-2 py-1">{stateLabel(p)}</td>
                      <td className="border px-2 py-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setHostIgnored((prev) => prev.filter((x) => x.currentName !== p.currentName));
                            setHostIgnoredSel((s) => s.filter((id) => id !== p.currentName));
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
