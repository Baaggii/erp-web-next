import fs from 'fs/promises';
import path from 'path';

const printersPath = path.join(process.cwd(), 'api-server', 'data', 'printers.json');

export async function listPrinters() {
  try {
    const data = await fs.readFile(printersPath, 'utf8');
    return JSON.parse(data || '[]');
  } catch {
    return [];
  }
}
