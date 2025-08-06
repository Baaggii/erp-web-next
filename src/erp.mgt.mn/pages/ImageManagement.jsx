
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
      setSessionNames(getSessionNames());
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
        .map(({ originalName = '', newName = '', tmpPath = '', reason = '', processed }) => ({
          originalName,
          newName,
          tmpPath,
          reason,
          processed: !!processed,
        }));

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
    setUploads(
      Array.isArray(data.uploads)
        ? data.uploads.map((u) => ({
            ...u,
            id: u.originalName,
            description: extractDateFromName(u.originalName),
            processed: !!u.processed,
          }))
        : [],
    );
    setIgnored(
      Array.isArray(data.ignored)
        ? data.ignored.map((u) => ({
            ...u,
            id: u.originalName,
            description: extractDateFromName(u.originalName),
            processed: !!u.processed,
          }))
        : [],
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

  function getSessionNames() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function sanitizeName(n = '') {
    return n.replace(/[^\w.-]/g, '_').slice(0, 100);
  }

  async function saveSession() {
    const raw = prompt('Session name?', folderName || new Date().toISOString());
    const name = raw ? sanitizeName(raw.trim()) : '';
    if (!name) return;
    try {
      const data = buildSession();
      const serialized = JSON.stringify(data);
      localStorage.setItem(SESSION_PREFIX + name, serialized);
      const names = new Set(getSessionNames());
      names.add(name);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify([...names]));
      await saveDirHandle(name, dirHandleRef.current);
      persistAll(data);
      setSessionNames([...names]);
      setSelectedSession(name);
      addToast('State saved', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save state', 'error');
    }
  }

  async function loadSession(name = selectedSession) {
    if (!name) {
      addToast('No session selected', 'error');
      return;
    }
    try {
      const raw = localStorage.getItem(SESSION_PREFIX + name);
      if (!raw) {
        addToast('No saved sessions', 'error');
        return;
      }
      const data = JSON.parse(raw);
      const dir = await loadDirHandle(name);
      if (dir) {
        try { await dir.requestPermission?.({ mode: 'read' }); } catch {}
        dirHandleRef.current = dir;
        data.uploads = await attachHandles(dir, data.uploads);
        data.ignored = await attachHandles(dir, data.ignored);
      } else {
        dirHandleRef.current = null;
      }
      applySession(data);
      setSelected([]);
      setHostIgnoredSel([]);
      setUploadSel([]);
      setUploadPage(1);
      setIgnoredPage(1);
      setHostIgnoredPage(1);
      setPendingPage(1);
      persistAll(data);
      addToast('State loaded', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to load session', 'error');
    }
  }

  async function deleteSession(name = selectedSession) {
    if (!name) return;
    try {
      localStorage.removeItem(SESSION_PREFIX + name);
      const names = getSessionNames().filter((n) => n !== name);
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(names));
      await deleteDirHandle(name);
      setSessionNames(names);
      if (selectedSession === name) setSelectedSession('');
      addToast('State deleted', 'success');
    } catch {
      addToast('Failed to delete session', 'error');
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
    (u) => uploadSel.includes(u.id) && u.handle && !u.processed,
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
      if (e.key === 'Escape' && activeOp) {
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
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeOp]);

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
      const handles = {};
      const names = [];
      for await (const entry of dirHandle.values()) {
        if (scanCancelRef.current) break;
        if (entry.kind === 'file') {
          names.push(entry.name);
          handles[entry.name] = entry;
        }
      }
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
      setFolderName(dirHandle.name || '');
      const sorted = all.slice().sort((a, b) => a.originalName.localeCompare(b.originalName));
      const uploadsList = sorted.map((u) => ({
        originalName: u.originalName,
        id: u.originalName,
        handle: handles[u.originalName],
        description: extractDateFromName(u.originalName),
        processed: false,
      }));
      setUploads(uploadsList);
      const skippedSorted = skipped
        .slice()
        .sort((a, b) => a.originalName.localeCompare(b.originalName));
      const ignoredList = skippedSorted.map((u) => ({
        originalName: u.originalName,
        id: u.originalName,
        handle: handles[u.originalName],
        reason: u.reason,
        processed: false,
      }));
      setIgnored(ignoredList);
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
        folderName: dirHandle.name || '',
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
    const items = list.filter((p) => sel.includes(p.currentName));
    if (items.length === 0) return;
    const chunkSize = 200;
    let totalFixed = 0;
    try {
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const res = await fetch('/api/transaction_images/fix_incomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ list: chunk }),
        });
        if (!res.ok) throw new Error('fail');
        const data = await res.json().catch(() => ({}));
        totalFixed += data.fixed || 0;
      }
      addToast(`Renamed ${totalFixed} file(s)`, 'success');
      setReport(`Renamed ${totalFixed} file(s)`);
      detectFromHost(page);
    } catch {
      addToast('Rename failed', 'error');
    }
  }

  async function applyFixes() {
    const newPending = await applyFixesSelection(pending, selected);
    if (newPending) {
      setPending(newPending);
      setSelected([]);
      persistAll({ uploads, ignored, folderName, pending: newPending, hostIgnored });
    }
  }

  async function applyFixesHostIgnored() {
    const newHostIgnored = await applyFixesSelection(hostIgnored, hostIgnoredSel);
    if (newHostIgnored) {
      setHostIgnored(newHostIgnored);
      setHostIgnoredSel([]);
      persistAll({ uploads, ignored, folderName, pending, hostIgnored: newHostIgnored });
    }
  }

  async function renameSelected() {
    if (activeOp === 'rename') {
      if (window.confirm('Cancel rename?')) {
        renameAbortRef.current?.abort();
        setActiveOp(null);
      }
      return;
    }

    const items = [...uploads, ...ignored].filter(
      (u) => uploadSel.includes(u.id) && u.handle && !u.tmpPath && !u.processed,
    );
    if (items.length === 0) {
      addToast('No local files to rename', 'error');
      return;
    }

    const controller = new AbortController();
    renameAbortRef.current = controller;
    setActiveOp('rename');

    async function uploadCheckBatch(batch) {
      if (controller.signal.aborted) return { list: [], missing: [] };
      const formData = new FormData();
      const valid = [];
      const missing = [];
      for (const u of batch) {
        try {
          const file = await u.handle.getFile();
          formData.append('images', file, u.originalName);
          valid.push(u);
        } catch {
          addToast(`Missing local file: ${u.originalName}`, 'error');
          missing.push(u.id);
        }
      }
      if (valid.length === 0) return { list: [], missing };
      try {
        res = await fetch('/api/transaction_images/upload_check', {
          method: 'POST',
          body: formData,
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { list: Array.isArray(data.list) ? data.list : [], missing };
        }
      } catch {
        if (controller.signal.aborted) return { list: [], missing };
        // fall through to recursive split
      }
      if (valid.length > 1) {
        const mid = Math.floor(valid.length / 2);
        const first = await uploadCheckBatch(valid.slice(0, mid));
        const second = await uploadCheckBatch(valid.slice(mid));
        return {
          list: [...first.list, ...second.list],
          missing: [...missing, ...first.missing, ...second.missing],
        };
      }
      addToast('Rename failed', 'error');
      return { list: [], missing };
    }

    let newUploads = uploads.slice();
    let newIgnored = ignored.slice();
    let renamedCount = 0;
    try {
      for (let i = 0; i < items.length && !controller.signal.aborted; i += 50) {
        const batch = items.slice(i, i + 50);
        const { list: res, missing } = await uploadCheckBatch(batch);
        renamedCount += res.length;
        const resMap = new Map(res.map((r) => [r.originalName, r]));
        const ids = new Set(batch.map((u) => u.id));
        const missingSet = new Set(missing);
        newUploads = newUploads
          .map((u) => {
            if (!ids.has(u.id)) return u;
            if (missingSet.has(u.id)) {
              const msg = 'Missing local file';
              return { ...u, description: msg, reason: msg };
            }
            const found = resMap.get(u.originalName);
            if (found) {
              const merged = { ...u, ...found, id: u.id, reason: '' };
              return { ...merged, description: extractDateFromName(merged.originalName) };
            }
            const msg = u.reason || 'No match found';
            return { ...u, description: msg, reason: msg };
          })
          .sort((a, b) => a.originalName.localeCompare(b.originalName));
        newIgnored = newIgnored
          .map((u) => {
            if (!ids.has(u.id)) return u;
            if (missingSet.has(u.id)) {
              const msg = 'Missing local file';
              return { ...u, description: msg, reason: msg };
            }
            const found = resMap.get(u.originalName);
            if (found) {
              const merged = { ...u, ...found, id: u.id, reason: '' };
              return { ...merged, description: extractDateFromName(merged.originalName) };
            }
            const msg = u.reason || 'No match found';
            return { ...u, description: msg, reason: msg };
          })
          .sort((a, b) => a.originalName.localeCompare(b.originalName));
        setUploads(newUploads);
        setIgnored(newIgnored);
        persistAll({ uploads: newUploads, ignored: newIgnored });
      }
      if (controller.signal.aborted) {
        addToast('Rename canceled', 'info');
        return;
      }
    } finally {
      setActiveOp(null);
    }

    setUploads(newUploads);
    setIgnored(newIgnored);
    persistAll({ uploads: newUploads, ignored: newIgnored });
    setUploadSel((s) => s.filter((id) => !items.some((u) => u.id === id)));
    setReport(`Renamed ${renamedCount} file(s)`);
  }

  async function commitUploads() {
    if (activeOp === 'commit') {
      if (window.confirm('Cancel upload commit?')) {
        commitAbortRef.current?.abort();
        setActiveOp(null);
      }
      return;
    }

    const tables = getTables();
    const allItems = Object.values(tables).flat();
    const items = allItems.filter(
      (u) => uploadSel.includes(u.id) && u.tmpPath && !u.processed,
    );
    if (items.length === 0) return;

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
        addToast(`Uploaded ${data.uploaded || 0} file(s)`, 'success');
        const updated = {};
        for (const [key, arr] of Object.entries(tables)) {
          updated[key] = arr.map((u) =>
            uploadSel.includes(u.id) && u.tmpPath ? { ...u, processed: true } : u,
          );
        }
        setUploads(updated.uploads);
        setIgnored(updated.ignored);
        setPending(updated.pending);
        setHostIgnored(updated.hostIgnored);
        setUploadSel([]);
        persistAll(updated);
        setReport(`Uploaded ${data.uploaded || 0} file(s)`);
      } else {
        addToast('Upload failed', 'error');
      }
    } catch {
      if (controller.signal.aborted) addToast('Upload canceled', 'info');
      else addToast('Upload failed', 'error');
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
            {folderName && <span style={{ marginRight: '0.5rem' }}>{folderName}</span>}
            <button
              type="button"
              onClick={saveSession}
              style={{ marginRight: '0.5rem' }}
            >
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
                onClick={commitUploads}
                style={{ marginBottom: '0.5rem' }}
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
                style={{ marginBottom: '0.5rem', marginLeft: '0.5rem' }}
                disabled={uploadSel.length === 0}
              >
                Delete Selected
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
