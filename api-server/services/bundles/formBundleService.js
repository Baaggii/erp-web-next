import { listTableColumnMeta } from '../../../db/index.js';
import { getConfigsByTable, listTransactionNames } from '../transactionFormConfig.js';
import { getDisplayFields } from '../displayFieldConfig.js';
import { listCustomRelations } from '../tableRelationsConfig.js';
import { cacheGetOrSet } from '../cache/cacheService.js';
import { CACHE_TTLS, cacheKeys } from '../cache/cacheKeys.js';

function findFormByModule(names, moduleKey) {
  for (const [table, forms] of Object.entries(names || {})) {
    for (const [name, config] of Object.entries(forms || {})) {
      if (config?.moduleKey === moduleKey || name === moduleKey) {
        return { table, name, config };
      }
    }
  }
  return null;
}

function normalizeRelations(relationsConfig = {}) {
  const out = [];
  Object.entries(relationsConfig).forEach(([field, rels]) => {
    (Array.isArray(rels) ? rels : []).forEach((rel) => {
      out.push({
        field,
        table: rel.table,
        valueField: rel.idField || rel.column,
        labelField: (rel.displayFields || [])[0] || rel.column,
        searchFields: [rel.idField || rel.column, ...((rel.displayFields || []).slice(0, 2))].filter(Boolean),
        mode: 'async-search',
      });
    });
  });
  return out;
}

export async function getFormBundle(context, session = {}) {
  const key = cacheKeys.formBundle(context);
  const result = await cacheGetOrSet(key, CACHE_TTLS.formBundle, async () => {
    const namesRes = await listTransactionNames(
      {
        moduleKey: context.moduleKey,
        branchId: context.branchId,
        departmentId: context.departmentId,
        userRightId: context.userRightId,
        workplaceId: context.workplaceId,
        positionId: context.positionId,
        workplacePositionId: context.workplacePositionId,
        workplacePositions: session?.workplace_assignments,
      },
      context.companyId,
    );

    const formHit = findFormByModule(namesRes?.names, context.moduleKey);
    if (!formHit) {
      const err = new Error(`Form bundle not found for moduleKey ${context.moduleKey}`);
      err.code = 'FORM_NOT_FOUND';
      throw err;
    }

    const [{ config: tableConfigs }, columnMeta, displayFields, customRelations] = await Promise.all([
      getConfigsByTable(formHit.table, context.companyId),
      listTableColumnMeta(formHit.table, context.companyId),
      getDisplayFields(formHit.table, context.companyId).then((r) => r?.displayFields || {}),
      listCustomRelations(formHit.table, context.companyId).then((r) => r?.config || {}),
    ]);

    const formConfig = tableConfigs?.[formHit.name] || formHit.config || {};

    const columns = (columnMeta || []).map((c) => ({
      field: c.field,
      type: c.type,
      required: !c.nullable,
      readonly: Boolean(c.readonly),
      defaultValue: c.default,
    }));

    return {
      moduleKey: context.moduleKey,
      form: {
        moduleKey: context.moduleKey,
        table: formHit.table,
        name: formHit.name,
        title: formConfig.title || formHit.name,
        mode: 'dynamic',
      },
      formConfig,
      columns,
      displayFields: { [formHit.table]: displayFields },
      relations: normalizeRelations(customRelations),
      triggers: formConfig.triggers || [],
      defaults: {
        company_id: context.companyId,
        branch_id: session?.branch_id ?? null,
        department_id: session?.department_id ?? null,
        created_by: context.userId,
        confirm_emp: context.userId,
      },
      lookupSeeds: {},
      proceduralMeta: {
        procTriggers: formConfig.procTriggers || [],
        supportsTemporarySummary: true,
      },
    };
  });

  return { ...result, key };
}
