// scripts/migrateReportBuilder.js
// Migration script to move report builder files from
// `uploads/report_builder` to `config/0/report_builder`.

import fs from 'fs/promises';
import path from 'path';

async function migrate() {
  const companyId = process.env.COMPANY_ID || '0';
  const oldDir = path.join(process.cwd(), 'uploads', 'report_builder');
  const newDir = path.join(process.cwd(), 'config', String(companyId), 'report_builder');
  const oldProcDir = path.join(oldDir, 'procedures');
  const newProcDir = path.join(newDir, 'procedures');

  try {
    await fs.access(oldDir);
  } catch {
    console.log('[migrate-report-builder] Nothing to migrate.');
    return;
  }

  await fs.mkdir(newDir, { recursive: true });
  await fs.mkdir(newProcDir, { recursive: true });

  const entries = await fs.readdir(oldDir, { withFileTypes: true });
  for (const entry of entries) {
    const oldPath = path.join(oldDir, entry.name);
    if (entry.isDirectory()) continue; // skip directories (procedures handled separately)
    const newPath = path.join(newDir, entry.name);
    await fs.rename(oldPath, newPath);
  }

  try {
    const procEntries = await fs.readdir(oldProcDir);
    for (const name of procEntries) {
      const oldPath = path.join(oldProcDir, name);
      const newPath = path.join(newProcDir, name);
      await fs.rename(oldPath, newPath);
    }
  } catch {}

  await fs.rm(oldDir, { recursive: true, force: true });
  console.log('[migrate-report-builder] Migration complete.');
}

migrate().catch((err) => {
  console.error('[migrate-report-builder] Migration failed:', err);
  process.exit(1);
});

