import fs from 'fs/promises';
import path from 'path';

const baseConfigDir = path.join(process.cwd(), 'config');

function isSafePath(file) {
  return file && !file.includes('..') && !path.isAbsolute(file);
}

async function listAllFiles(dir, root = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAllFiles(full, root)));
    } else {
      files.push(path.relative(root, full));
    }
  }
  return files;
}

export async function importConfigFiles(files = [], companyId = 0, type = '') {
  const sourceDir = type
    ? path.join(baseConfigDir, '0', type)
    : path.join(baseConfigDir, '0');
  const targetDir = type
    ? path.join(baseConfigDir, String(companyId), type)
    : path.join(baseConfigDir, String(companyId));
  const results = [];
  try {
    await fs.mkdir(targetDir, { recursive: true });
  } catch (err) {
    return files.map((file) => ({ file, status: 'error', message: err.message }));
  }

  // If no files specified, copy entire directory tree
  if (!files || files.length === 0) {
    try {
      const allFiles = await listAllFiles(sourceDir);
      for (const file of allFiles) {
        const src = path.join(sourceDir, file);
        const dest = path.join(targetDir, file);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.copyFile(src, dest);
        results.push({ file, status: 'imported' });
      }
    } catch (err) {
      results.push({ file: '*', status: 'error', message: err.message });
    }
    return results;
  }

  for (const file of files) {
    if (!isSafePath(file)) {
      results.push({ file, status: 'error', message: 'invalid file path' });
      continue;
    }
    const src = path.join(sourceDir, file);
    const dest = path.join(targetDir, file);
    try {
      await fs.copyFile(src, dest);
      results.push({ file, status: 'imported' });
    } catch (err) {
      results.push({ file, status: 'error', message: err.message });
    }
  }
  return results;
}

