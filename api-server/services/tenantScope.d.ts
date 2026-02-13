export type TenantScopeResult = {
  sourceTable: string;
  tempTableName: string;
  scoped: boolean;
};

export type TempTableCreationOptions = {
  tmpTableName?: string;
  force?: boolean;
};

export type TenantEngineConfig = {
  excludedSystemTables?: Set<string>;
  procedureName?: string;
};

export function shouldTenantScopeTable(tableName: string, config?: TenantEngineConfig): boolean;

export function createTmpBusinessTable(
  connection: { query: (sql: string, params?: unknown[]) => Promise<any> },
  tableName: string,
  companyId: number | string,
  options?: TempTableCreationOptions,
): Promise<TenantScopeResult>;

export function queryWithTenantScope(
  connection: { query: (sql: string, params?: unknown[]) => Promise<any> },
  tableName: string,
  companyId: number | string,
  originalQuery: string,
  params?: unknown[],
): Promise<[any, any]>;
