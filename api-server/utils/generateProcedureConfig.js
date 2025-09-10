import fs from 'fs/promises';
import path from 'path';
import { tenantConfigPath } from './configPaths.js';
import parseProcedureConfig from '../../utils/parseProcedureConfig.js';

export async function generateProcedureConfig(name, sql, companyId = 0) {
  const result = parseProcedureConfig(sql);
  if (result?.converted) {
    const filePath = tenantConfigPath(
      path.join('report_builder', `${name}.json`),
      companyId,
    );
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(result.config, null, 2));
  }
  return result;
}
