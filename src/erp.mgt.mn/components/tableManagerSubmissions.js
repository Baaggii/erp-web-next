export function buildTableQuery({ table, page, perPage, company, columns, sort, filters }) {
  const params = new URLSearchParams({ page, perPage });
  if (company != null && columns?.has('company_id')) params.set('company_id', company);
  if (sort?.column) {
    params.set('sort', sort.column);
    params.set('dir', sort.dir);
  }
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `/api/tables/${encodeURIComponent(table)}?${params.toString()}`;
}

export async function fetchLatestTableRows(options) {
  const { fetchImpl = fetch } = options;
  const url = buildTableQuery(options);
  const response = await fetchImpl(url, { credentials: 'include' });
  return response.json();
}

export async function submitEditRequest(
  cleaned,
  {
    promptRequestReason,
    addToast,
    t,
    table,
    editing,
    setShowForm,
    setEditing,
    setIsAdding,
    setGridRows,
    setRequestType,
    getRowId,
    API_BASE: apiBase,
    fetchImpl = fetch,
  },
) {
  const reason = await promptRequestReason();
  if (!reason || !reason.trim()) {
    addToast(
      t('request_reason_required', 'Request reason is required'),
      'error',
    );
    return false;
  }
  try {
    const res = await fetchImpl(`${apiBase}/pending_request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        table_name: table,
        record_id: getRowId(editing),
        request_type: 'edit',
        request_reason: reason,
        proposed_data: cleaned,
      }),
    });
    if (res.ok) {
      addToast(t('edit_request_submitted', 'Edit request submitted'), 'success');
      setShowForm(false);
      setEditing(null);
      setIsAdding(false);
      setGridRows([]);
      setRequestType(null);
      return true;
    }
    if (res.status === 409) {
      addToast(
        t('similar_request_pending', 'A similar request is already pending'),
        'error',
      );
      return false;
    }
    addToast(t('edit_request_failed', 'Edit request failed'), 'error');
    return false;
  } catch {
    addToast(t('edit_request_failed', 'Edit request failed'), 'error');
    return false;
  }
}

export async function submitNewRow(
  cleaned,
  {
    columns,
    user,
    formatTimestamp: formatTs,
    fetchImpl = fetch,
    table,
    page,
    perPage,
    company,
    sort,
    filters,
    setRows,
    setCount,
    logRowsMemory: logMemory,
    setSelectedRows,
    setShowForm,
    setEditing,
    setIsAdding,
    setGridRows,
    addToast,
    openAdd,
    formConfig,
    merged,
    buildImageName: buildName,
    columnCaseMap,
    getRowId,
    getImageFolder,
    oldImageName,
  },
) {
  const payload = { ...cleaned };
  if (columns?.has('created_by')) payload.created_by = user?.empid;
  if (columns?.has('created_at')) payload.created_at = formatTs(new Date());
  const url = `/api/tables/${encodeURIComponent(table)}`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const savedRow = res.ok ? await res.json().catch(() => ({})) : {};
    if (!res.ok) {
      let message = 'Хадгалахад алдаа гарлаа';
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore
      }
      addToast(message, 'error');
      return false;
    }

    const data = await fetchLatestTableRows({
      fetchImpl,
      table,
      page,
      perPage,
      company,
      columns,
      sort,
      filters,
    });
    const rows = data.rows || [];
    setRows(rows);
    setCount(data.total ?? data.count ?? 0);
    logMemory(rows);
    setSelectedRows(new Set());
    setShowForm(false);
    setEditing(null);
    setIsAdding(false);
    setGridRows([]);

    if ((formConfig?.imagenameField || []).length) {
      const inserted = rows.find(
        (r) => String(getRowId(r)) === String(savedRow.id),
      );
      const rowForName =
        inserted || {
          ...merged,
          [formConfig.imageIdField]: savedRow?.[formConfig.imageIdField],
        };
      const nameFields = Array.from(
        new Set(
          (formConfig?.imagenameField || [])
            .concat(formConfig?.imageIdField || '')
            .filter(Boolean),
        ),
      );
      const { name: newImageName } = buildName(
        rowForName,
        nameFields,
        columnCaseMap,
      );
      const folder = getImageFolder(rowForName);
      if (
        oldImageName &&
        newImageName &&
        (oldImageName !== newImageName || folder !== table)
      ) {
        const renameUrl =
          `/api/transaction_images/${table}/${encodeURIComponent(oldImageName)}` +
          `/rename/${encodeURIComponent(newImageName)}?folder=${encodeURIComponent(folder)}`;
        await fetchImpl(renameUrl, { method: 'POST', credentials: 'include' });
        const verifyUrl =
          `/api/transaction_images/${table}/${encodeURIComponent(newImageName)}?folder=${encodeURIComponent(folder)}`;
        const res2 = await fetchImpl(verifyUrl, { credentials: 'include' });
        const imgs = res2.ok ? await res2.json().catch(() => []) : [];
        if (!Array.isArray(imgs) || imgs.length === 0) {
          await fetchImpl(renameUrl, { method: 'POST', credentials: 'include' });
        }
      }
    }

    addToast('Шинэ гүйлгээ хадгалагдлаа', 'success');
    setTimeout(() => openAdd(), 0);
    return true;
  } catch (err) {
    console.error('Save failed', err);
    return false;
  }
}

export async function submitUpdate(
  cleaned,
  {
    fetchImpl = fetch,
    table,
    editing,
    getRowId,
    page,
    perPage,
    company,
    columns,
    sort,
    filters,
    setRows,
    setCount,
    logRowsMemory: logMemory,
    setSelectedRows,
    setShowForm,
    setEditing,
    setIsAdding,
    setGridRows,
    addToast,
  },
) {
  const url = `/api/tables/${encodeURIComponent(table)}/${encodeURIComponent(
    getRowId(editing),
  )}`;
  try {
    const res = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(cleaned),
    });
    if (!res.ok) {
      let message = 'Хадгалахад алдаа гарлаа';
      try {
        const data = await res.json();
        if (data && data.message) message += `: ${data.message}`;
      } catch {
        // ignore
      }
      addToast(message, 'error');
      return false;
    }

    const data = await fetchLatestTableRows({
      fetchImpl,
      table,
      page,
      perPage,
      company,
      columns,
      sort,
      filters,
    });
    const rows = data.rows || [];
    setRows(rows);
    setCount(data.total ?? data.count ?? 0);
    logMemory(rows);
    setSelectedRows(new Set());
    setShowForm(false);
    setEditing(null);
    setIsAdding(false);
    setGridRows([]);
    addToast('Хадгалагдлаа', 'success');
    return true;
  } catch (err) {
    console.error('Save failed', err);
    return false;
  }
}
