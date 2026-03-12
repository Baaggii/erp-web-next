import { lazy } from 'react';

const importers = {
  dashboard: () => import('../pages/DashboardPage.jsx'),
  forms: () => import('../pages/Forms.jsx'),
  reports: () => import('../pages/Reports.jsx'),
  settings: () => import('../pages/Settings.jsx'),
  users: () => import('../pages/Users.jsx'),
  companies: () => import('../pages/Companies.jsx'),
  role_permissions: () => import('../pages/RolePermissions.jsx'),
  user_level_actions: () => import('../pages/UserLevelActions.jsx'),
  user_settings: () => import('../pages/UserSettings.jsx'),
  modules: () => import('../pages/Modules.jsx'),
  company_licenses: () => import('../pages/CompanyLicenses.jsx'),
  tables_management: () => import('../pages/TablesManagement.jsx'),
  coding_tables: () => import('../pages/CodingTables.jsx'),
  forms_management: () => import('../pages/FormsManagement.jsx'),
  report_management: () => import('../pages/ReportManagement.jsx'),
  report_builder: () => import('../pages/ReportBuilder.jsx'),
  relations_config: () => import('../pages/RelationsConfig.jsx'),
  pos_transaction_management: () => import('../pages/PosTxnConfig.jsx'),
  pos_transactions: () => import('../pages/PosTransactions.jsx'),
  general_configuration: () => import('../pages/GeneralConfiguration.jsx'),
  image_management: () => import('../pages/ImageManagement.jsx'),
  change_password: () => import('../pages/ChangePassword.jsx'),
  requests: () => import('../pages/Requests.jsx'),
  tenant_tables_registry: () => import('../pages/TenantTablesRegistry.jsx'),
  edit_translations: () => import('../pages/TranslationEditor.jsx'),
  user_manual_export: () => import('../pages/UserManualExport.jsx'),
  report_access: () => import('../pages/AllowedReportsConfig.jsx'),
  cnc_processing: () => import('../pages/CncProcessingPage.jsx'),
  accounting_periods: () => import('../pages/AccountingPeriods.jsx'),
  sales: () => import('../components/TabbedWindows.jsx'),
  messaging: () => import('../components/MessagingWidget.jsx'),
};

const componentCache = new Map();

function moduleKeyToPath(moduleKey) {
  if (moduleKey === 'dashboard') return '/';
  return `/${String(moduleKey || '').replace(/_/g, '-')}`;
}

function resolveImporter(module) {
  const moduleKey = module?.module_key || '';
  if (importers[moduleKey]) return importers[moduleKey];
  if (moduleKey.startsWith('proc_')) return () => import('../pages/Reports.jsx');
  if (module?.parent_key === 'forms') return () => import('../pages/FinanceTransactions.jsx');
  return () => import('../pages/Forms.jsx');
}

function getLazyComponent(module) {
  const moduleKey = module?.module_key || '';
  if (componentCache.has(moduleKey)) return componentCache.get(moduleKey);
  const importer = resolveImporter(module);
  const Component = lazy(importer);
  componentCache.set(moduleKey, Component);
  return Component;
}

function getPageType(moduleKey = '') {
  if (moduleKey.startsWith('proc_')) return 'report';
  if (moduleKey.includes('report')) return 'report';
  if (moduleKey.includes('settings') || moduleKey.includes('config')) return 'settings';
  if (moduleKey.includes('table')) return 'table';
  if (moduleKey.includes('form') || moduleKey.includes('transaction')) return 'transaction';
  return 'page';
}

export function createLazyRouteEntry(module) {
  const moduleKey = module?.module_key || '';
  return {
    id: moduleKey,
    moduleKey,
    title: module?.label || moduleKey,
    icon: module?.icon || null,
    path: module?.routePath || moduleKeyToPath(moduleKey),
    pageType: getPageType(moduleKey),
    parentKey: module?.parent_key || null,
    preloadPriority: Number(module?.preloadPriority ?? module?.preload_priority ?? 0),
    Component: getLazyComponent(module),
    preload: () => resolveImporter(module)(),
  };
}

export function preloadRouteBundle(route) {
  if (!route || typeof route.preload !== 'function') return;
  route.preload();
}
