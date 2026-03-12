import {
  listModules,
  listCompanyModuleLicenses,
  getUserLevelActions,
} from '../../../db/index.js';
import { getUserSettings } from '../userSettings.js';
import { getGeneralConfig } from '../generalConfig.js';
import { listTransactionNames } from '../transactionFormConfig.js';
import { listAllowedReports } from '../reportAccessConfig.js';
import { cacheGetOrSet } from '../cache/cacheService.js';
import { CACHE_TTLS, cacheKeys } from '../cache/cacheKeys.js';

function shapeMenu(transactionNames = {}) {
  const forms = Object.entries(transactionNames).map(([table, items]) => ({
    table,
    forms: Object.keys(items || {}),
  }));
  return { groups: [], forms, reports: [] };
}

export async function getBootstrapBundle(context, session = {}) {
  const key = cacheKeys.bootstrap(context);
  const result = await cacheGetOrSet(key, CACHE_TTLS.bootstrap, async () => {
    const [
      settings,
      generalConfig,
      companyModules,
      modules,
      transactionNames,
      reportAccess,
    ] = await Promise.all([
      getUserSettings(context.userId, context.companyId),
      getGeneralConfig(context.companyId).then((r) => r?.config ?? {}),
      listCompanyModuleLicenses(context.companyId, context.userId),
      listModules(reqUserLevel(session), context.companyId),
      listTransactionNames(
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
      ).then((r) => r?.names ?? {}),
      listAllowedReports(context.companyId).then((r) => r?.config ?? {}),
    ]);

    const permissions = session?.user_level
      ? await getUserLevelActions(session.user_level, context.companyId)
      : {};

    return {
      user: {
        emp_id: context.userId,
        name: session?.name || context.userId,
        company_id: context.companyId,
        branch_id: session?.branch_id ?? null,
        department_id: session?.department_id ?? null,
        position_id: session?.position_id ?? null,
        workplace_id: session?.workplace_id ?? null,
        user_right_id: session?.user_right_id ?? null,
      },
      settings,
      generalConfig,
      companyModules,
      modules,
      menu: shapeMenu(transactionNames),
      permissions: {
        actions: permissions,
        tables: {},
        reports: {},
      },
      reportAccess,
      featureFlags: {
        useBundleApi: true,
        useRelationSearch: true,
      },
    };
  });

  return { ...result, key };
}

function reqUserLevel(session = {}) {
  return Number(session?.user_level) || 0;
}
