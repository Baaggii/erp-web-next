import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { searchImages } from '../../api-server/services/transactionImageService.js';
import { updateGeneralConfig, getGeneralConfig } from '../../api-server/services/generalConfig.js';

const baseDir = path.join(process.cwd(), 'uploads', 'txn_images', 'search_images_test');

await test('searchImages finds files by field value', async () => {
  const orig = await getGeneralConfig();
  await updateGeneralConfig({
    images: {
      ignoreOnSearch: [
        path.join(process.cwd(), 'uploads'),
        path.join(baseDir, 'ignored'),
      ],
    },
  });

  await fs.rm(baseDir, { recursive: true, force: true });
  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(path.join(baseDir, 'a_123_b.jpg'), 'x');
  await fs.mkdir(path.join(baseDir, 'sub'), { recursive: true });
  await fs.writeFile(path.join(baseDir, 'sub', 'c-123-d.png'), 'x');
  await fs.writeFile(path.join(baseDir, 'sub', 'e~123~f.jpeg'), 'x');
  await fs.mkdir(path.join(baseDir, 'ignored'), { recursive: true });
  await fs.writeFile(path.join(baseDir, 'ignored', 'g_123_h.png'), 'x');
  await fs.writeFile(path.join(baseDir, 'nomatch.jpg'), 'x');

  const { files, total } = await searchImages('123', 1, 10);
  assert.equal(total, 3);
  const joined = files.join('\n');
  assert.ok(joined.includes('a_123_b.jpg'));
  assert.ok(joined.includes('c-123-d.png'));
  assert.ok(joined.includes('e~123~f.jpeg'));
  assert.ok(!joined.includes('g_123_h.png'));

  await fs.rm(baseDir, { recursive: true, force: true });
  await updateGeneralConfig({ images: { ignoreOnSearch: orig.images?.ignoreOnSearch || [] } });
});
