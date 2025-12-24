import { buildOptionsForRows } from './buildAsyncSelectOptions.js';

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeWorkplaceId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : value.trim();
  }
  return value;
}

function buildKeyMap(row) {
  const keyMap = {};
  Object.keys(row || {}).forEach((key) => {
    keyMap[key.toLowerCase()] = key;
  });
  return keyMap;
}

function normalizeRelationEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const table =
    (typeof entry.REFERENCED_TABLE_NAME === 'string' && entry.REFERENCED_TABLE_NAME.trim()) ||
    (typeof entry.table === 'string' && entry.table.trim()) ||
    (typeof entry.targetTable === 'string' && entry.targetTable.trim()) ||
    '';
  const column =
    (typeof entry.COLUMN_NAME === 'string' && entry.COLUMN_NAME.trim()) ||
    (typeof entry.sourceColumn === 'string' && entry.sourceColumn.trim()) ||
    (typeof entry.source_column === 'string' && entry.source_column.trim()) ||
    (typeof entry.column === 'string' && entry.column.trim()) ||
    (typeof entry.targetColumn === 'string' && entry.targetColumn.trim()) ||
    '';
  const targetColumn =
    (typeof entry.REFERENCED_COLUMN_NAME === 'string' && entry.REFERENCED_COLUMN_NAME.trim()) ||
    (typeof entry.targetColumn === 'string' && entry.targetColumn.trim()) ||
    '';
  if (!table || !column) return null;
  const rel = {
    table,
    column,
    targetColumn,
    tableLower: table.toLowerCase(),
    columnLower: column.toLowerCase(),
  };
  const idField = entry.idField ?? entry.id_field;
  if (typeof idField === 'string' && idField.trim()) {
    rel.idField = idField.trim();
  }
  const displayFields = entry.displayFields ?? entry.display_fields;
  if (Array.isArray(displayFields)) {
    rel.displayFields = displayFields.filter((f) => typeof f === 'string' && f.trim());
  }
  const combinationSource =
    entry.combinationSourceColumn ?? entry.combination_source_column ?? entry.combinationSource;
  const combinationTarget =
    entry.combinationTargetColumn ?? entry.combination_target_column ?? entry.combinationTarget;
  if (typeof combinationSource === 'string' && combinationSource.trim()) {
    rel.combinationSourceColumn = combinationSource.trim();
  }
  if (typeof combinationTarget === 'string' && combinationTarget.trim()) {
    rel.combinationTargetColumn = combinationTarget.trim();
  }
  const filterColumn = entry.filterColumn ?? entry.filter_column;
  const filterValue = entry.filterValue ?? entry.filter_value;
  if (typeof filterColumn === 'string' && filterColumn.trim()) {
    rel.filterColumn = filterColumn.trim();
  }
  if (filterValue !== undefined && filterValue !== null) {
    rel.filterValue = filterValue;
  }
  return rel;
}

async function fetchRelations(signal) {
  try {
    const res = await fetch('/api/tables/code_workplace/relations', {
      credentials: 'include',
      signal,
    });
    if (!res.ok) return [];
    const list = await res.json().catch(() => []);
    if (!Array.isArray(list)) return [];
    return list
      .map((entry) => normalizeRelationEntry(entry))
      .filter((entry) => entry);
  } catch (err) {
    if (signal?.aborted) return [];
    return [];
  }
}

async function fetchDisplayConfig(table, relation = null, signal) {
  if (!table) return { idField: undefined, displayFields: [] };
  try {
    const params = new URLSearchParams({ table });
    const relFilterColumn = relation?.filterColumn ?? relation?.filter_column;
    const relFilterValue = relation?.filterValue ?? relation?.filter_value;
    if (relFilterColumn && relFilterValue !== undefined && relFilterValue !== null) {
      params.set('filterColumn', relFilterColumn);
      params.set('filterValue', String(relFilterValue));
    }
    const res = await fetch(`/api/display_fields?${params.toString()}`, {
      credentials: 'include',
      signal,
    });
    if (!res.ok) return { idField: undefined, displayFields: [] };
    const cfg = await res.json().catch(() => ({}));
    const idField =
      (typeof cfg?.idField === 'string' && cfg.idField.trim()) ||
      (typeof cfg?.id_field === 'string' && cfg.id_field.trim()) ||
      undefined;
    const displayFields = Array.isArray(cfg?.displayFields)
      ? cfg.displayFields.filter((field) => typeof field === 'string' && field.trim())
      : [];
    return { idField, displayFields };
  } catch (err) {
    if (signal?.aborted) return { idField: undefined, displayFields: [] };
    return { idField: undefined, displayFields: [] };
  }
}

function normalizePositionId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export function collectWorkplaceIds(session) {
  const ids = [];
  const assignments = Array.isArray(session?.workplace_assignments)
    ? session.workplace_assignments
    : [];
  assignments.forEach((assignment) => {
    const wId =
      assignment?.workplace_id ??
      assignment?.workplaceId ??
      assignment?.id ??
      null;
    if (wId !== null && wId !== undefined) {
      ids.push(wId);
    }
  });
  const sessionId = session?.workplace_id ?? session?.workplaceId;
  if (sessionId !== null && sessionId !== undefined) {
    ids.push(sessionId);
  }
  return Array.from(
    new Set(
      ids
        .map((value) => normalizeWorkplaceId(value))
        .filter((value) => value !== null && value !== undefined),
    ),
  );
}

export function deriveWorkplacePositionsFromAssignments(session) {
  const map = {};
  const assignments = Array.isArray(session?.workplace_assignments)
    ? session.workplace_assignments
    : [];
  assignments.forEach((assignment) => {
    const workplaceId = normalizeWorkplaceId(
      assignment?.workplace_id ?? assignment?.workplaceId ?? assignment?.id,
    );
    if (workplaceId === null || workplaceId === undefined) return;
    const positionId =
      assignment?.workplace_position_id ??
      assignment?.workplacePositionId ??
      assignment?.position_id ??
      assignment?.positionId ??
      assignment?.position ??
      null;
    const positionName =
      normalizeText(assignment?.workplace_position_name ?? assignment?.workplacePositionName) ||
      normalizeText(assignment?.position_name ?? assignment?.positionName);
    map[workplaceId] = {
      positionId: normalizePositionId(positionId),
      positionName: positionName || null,
    };
  });
  return map;
}

export async function resolveWorkplacePositionMap({
  session,
  workplaceIds,
  signal,
} = {}) {
  const allWorkplaceIds = Array.isArray(workplaceIds) && workplaceIds.length
    ? Array.from(new Set(workplaceIds.map((id) => normalizeWorkplaceId(id)).filter((id) => id !== null && id !== undefined)))
    : collectWorkplaceIds(session);

  if (!allWorkplaceIds.length) return {};

  const seedMap = deriveWorkplacePositionsFromAssignments(session);
  const companyId = session?.company_id ?? session?.companyId ?? null;

  try {
    const [relations, workplaceDisplayCfg] = await Promise.all([
      fetchRelations(signal),
      fetchDisplayConfig('code_workplace', null, signal),
    ]);
    if (signal?.aborted) return seedMap;

    const positionRelation =
      relations.find((rel) => rel.tableLower === 'code_position') ||
      relations.find((rel) => rel.columnLower.includes('position')) ||
      null;
    const positionTable = positionRelation?.table || 'code_position';
    const positionDisplayCfg = await fetchDisplayConfig(positionTable, positionRelation, signal);
    if (signal?.aborted) return seedMap;

    const positionLabelFields =
      Array.isArray(positionRelation?.displayFields) && positionRelation.displayFields.length > 0
        ? positionRelation.displayFields
        : positionDisplayCfg.displayFields;
    const workplaceIdField = workplaceDisplayCfg.idField || 'workplace_id';
    const positionSourceColumn =
      positionRelation?.column || positionRelation?.targetColumn || 'position_id';
    const positionTargetField =
      positionRelation?.idField ||
      positionRelation?.targetColumn ||
      positionDisplayCfg.idField ||
      positionSourceColumn ||
      'position_id';
    const entries = { ...seedMap };
    const uniquePositionIds = new Set(
      Object.values(seedMap)
        .map((entry) => normalizePositionId(entry?.positionId))
        .filter((value) => value !== null),
    );

    await Promise.all(
      allWorkplaceIds.map(async (workplaceId) => {
        const params = new URLSearchParams();
        params.set('perPage', '1');
        params.set(workplaceIdField, String(workplaceId));
        if (companyId !== null && companyId !== undefined) {
          params.set('company_id', String(companyId));
        }
        try {
          const res = await fetch(
            `/api/tables/code_workplace?${params.toString()}`,
            { credentials: 'include', signal },
          );
          if (!res.ok) return;
          const data = await res.json().catch(() => ({}));
          const rows = Array.isArray(data?.rows) ? data.rows : [];
          if (!rows.length) return;
          const row = rows[0];
          const keyMap = buildKeyMap(row);
          const resolvedWorkplaceKey = keyMap[workplaceIdField.toLowerCase()] || workplaceIdField;
          const resolvedWorkplaceId =
            resolvedWorkplaceKey && row[resolvedWorkplaceKey] !== undefined
              ? row[resolvedWorkplaceKey]
              : workplaceId;
          const positionKey = positionSourceColumn
            ? keyMap[positionSourceColumn.toLowerCase()] || positionSourceColumn
            : null;
          const rawPositionId = positionKey ? row[positionKey] : null;
          if (rawPositionId !== null && rawPositionId !== undefined) {
            const normalizedId = String(rawPositionId).trim();
            if (normalizedId) {
              uniquePositionIds.add(normalizedId);
            }
          }
          const inlineNameCandidates = [];
          (Array.isArray(positionLabelFields)
            ? positionLabelFields
            : []
          ).forEach((field) => {
            const mapped = keyMap[field.toLowerCase()] || field;
            if (mapped in row) {
              inlineNameCandidates.push(row[mapped]);
            }
          });
          const inlinePositionName =
            inlineNameCandidates.map((val) => normalizeText(val)).find((val) => val) ??
            normalizeText(row[keyMap.position_name]) ??
            normalizeText(row[keyMap.workplace_position_name]);
          const existing = entries[resolvedWorkplaceId] || {};
          entries[resolvedWorkplaceId] = {
            positionId: normalizePositionId(existing.positionId ?? rawPositionId),
            positionName: existing.positionName ?? inlinePositionName ?? null,
          };
        } catch (err) {
          if (signal?.aborted) return;
          console.warn('Failed to resolve workplace position', {
            workplaceId,
            err,
          });
        }
      }),
    );

    if (signal?.aborted) return seedMap;
    if (uniquePositionIds.size === 0) {
      return entries;
    }

    const resolvedPositionLabels = {};
    await Promise.all(
      Array.from(uniquePositionIds).map(async (posId) => {
        const params = new URLSearchParams();
        params.set('perPage', '1');
        params.set(positionTargetField, posId);
        if (
          positionRelation?.filterColumn &&
          positionRelation.filterValue !== undefined &&
          positionRelation.filterValue !== null
        ) {
          params.set(positionRelation.filterColumn, String(positionRelation.filterValue));
        }
        if (companyId !== null && companyId !== undefined) {
          params.set('company_id', String(companyId));
        }
        try {
          const res = await fetch(
            `/api/tables/${encodeURIComponent(positionTable)}?${params.toString()}`,
            { credentials: 'include', signal },
          );
          if (!res.ok) return;
          const json = await res.json().catch(() => ({}));
          const rows = Array.isArray(json?.rows) ? json.rows : [];
          if (!rows.length) return;
          const options = await buildOptionsForRows({
            table: positionTable,
            rows,
            idField: positionTargetField,
            searchColumn: positionTargetField,
            labelFields: positionLabelFields,
            companyId,
          });
          const match = options.find(
            (opt) =>
              opt?.value !== undefined &&
              opt?.value !== null &&
              String(opt.value).trim() === posId,
          );
          if (match?.label) {
            resolvedPositionLabels[posId] = match.label;
            return;
          }
          const row = rows[0] || {};
          const keyMap = buildKeyMap(row);
          const fallbackLabel = (positionLabelFields || [])
            .map((field) => {
              const mapped = keyMap[field.toLowerCase()] || field;
              return normalizeText(row[mapped]);
            })
            .find((val) => val && val.length);
          resolvedPositionLabels[posId] =
            fallbackLabel ??
            normalizeText(row.position_name) ??
            normalizeText(row.name) ??
            posId;
        } catch (err) {
          if (signal?.aborted) return;
          console.warn('Failed to resolve position label', { positionId: posId, err });
        }
      }),
    );

    const finalEntries = {};
    Object.entries(entries).forEach(([workplaceId, info]) => {
      const normalizedId =
        info?.positionId === null || info?.positionId === undefined
          ? null
          : String(info.positionId).trim();
      finalEntries[workplaceId] = {
        positionId: normalizedId || info?.positionId || null,
        positionName:
          info?.positionName ||
          (normalizedId ? resolvedPositionLabels[normalizedId] : null) ||
          null,
      };
    });

    return finalEntries;
  } catch (err) {
    if (signal?.aborted) return seedMap;
    console.warn('Failed to resolve workplace positions', err);
    return seedMap;
  }
}
