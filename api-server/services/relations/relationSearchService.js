import { listTableColumnsDetailed, listTableRows } from '../../../db/index.js';
import { listCustomRelations } from '../tableRelationsConfig.js';
import { cacheGetOrSet } from '../cache/cacheService.js';
import { CACHE_TTLS, cacheKeys } from '../cache/cacheKeys.js';

function parseIds(ids) {
  if (!ids) return [];
  if (Array.isArray(ids)) return ids.map((v) => String(v));
  return String(ids)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function searchRelation(context, query = {}) {
  const key = cacheKeys.relation({
    table: context.table,
    companyId: context.companyId,
    search: query.search || '',
    limit: query.limit || 20,
    cursor: query.cursor || '',
    ids: query.ids || [],
    contextField: query.contextField || '',
    contextValue: query.contextValue || '',
  });

  const result = await cacheGetOrSet(key, CACHE_TTLS.relationStatic, async () => {
    const table = context.table;
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const ids = parseIds(query.ids);

    const relationConfig = await listCustomRelations(table, context.companyId).then((r) => r?.config || {});
    const firstRelationField = Object.values(relationConfig)[0];
    const firstRelation = Array.isArray(firstRelationField) ? firstRelationField[0] : null;

    const columns = await listTableColumnsDetailed(table);
    const defaultId = firstRelation?.idField || columns.find((c) => /(^id$|_id$)/.test(c.Field))?.Field || columns[0]?.Field;
    const defaultLabel =
      (firstRelation?.displayFields || [])[0] ||
      columns.find((c) => /name|label|title/i.test(c.Field))?.Field ||
      defaultId;

    const valueField = String(query.valueField || defaultId);
    const labelField = String(query.labelField || defaultLabel);

    const filters = { company_id: context.companyId };
    if (query.contextField && query.contextValue !== undefined) {
      filters[String(query.contextField)] = query.contextValue;
    }

    const { rows } = await listTableRows(table, {
      page: 1,
      perPage: limit,
      filters,
      search: query.search || '',
      searchColumns: Array.from(new Set([valueField, labelField])).filter(Boolean),
    });

    const makeItem = (row) => ({
      value: String(row?.[valueField] ?? ''),
      label: `${row?.[valueField] ?? ''} - ${row?.[labelField] ?? ''}`.trim(),
      raw: row,
    });

    const selected = ids.length
      ? rows.filter((row) => ids.includes(String(row?.[valueField]))).map((row) => ({
          value: String(row?.[valueField] ?? ''),
          label: `${row?.[valueField] ?? ''} - ${row?.[labelField] ?? ''}`.trim(),
        }))
      : [];

    return {
      table,
      items: rows.map(makeItem),
      pageInfo: {
        limit,
        nextCursor: null,
        hasMore: false,
      },
      selected,
    };
  });

  return { ...result, key };
}
