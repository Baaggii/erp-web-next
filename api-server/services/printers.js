import fs from 'fs/promises';
import { resolveDataPath } from '../utils/dataPaths.js';

export async function listPrinters(companyId = 0) {
  try {
    const printersPath = await resolveDataPath('printers.json', companyId);
    const data = await fs.readFile(printersPath, 'utf8');
    return JSON.parse(data || '[]');
  } catch {
    return [];
  }
}
