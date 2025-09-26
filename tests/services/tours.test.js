import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTour } from '../../api-server/services/tours.js';

const COMPANY_ID = 'get-tour-tests';
const DATA_DIR = path.join('api-server', 'data', COMPANY_ID);
const TOURS_FILE = path.join(DATA_DIR, 'tours.json');

async function writeToursFile(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOURS_FILE, JSON.stringify(data, null, 2));
}

test.after(async () => {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
});

test('getTour prefers path matches over pageKey matches', { concurrency: false }, async () => {
  await writeToursFile({
    sharedKey: {
      path: '/shared-path',
      steps: [
        {
          selector: '#shared',
          content: 'Shared step',
        },
      ],
    },
    reports: {
      path: '/reports/sales',
      steps: [
        {
          selector: '#reports',
          content: 'Reports step',
        },
      ],
    },
  });

  const tour = await getTour(
    {
      pageKey: 'sharedKey',
      path: '/reports/sales?filter=open#section-2',
    },
    COMPANY_ID,
  );

  assert.ok(tour, 'tour is returned');
  assert.equal(tour.pageKey, 'reports');
  assert.equal(tour.path, '/reports/sales');
  assert.equal(tour.steps.length, 1);
  assert.equal(tour.steps[0].selector, '#reports');
});

test('getTour falls back to pageKey when no path match exists', { concurrency: false }, async () => {
  await writeToursFile({
    sharedKey: {
      path: '/shared-path',
      steps: [
        {
          selector: '#shared',
          content: 'Shared step',
        },
      ],
    },
  });

  const tour = await getTour(
    {
      pageKey: 'sharedKey',
      path: '/unknown-path',
    },
    COMPANY_ID,
  );

  assert.ok(tour, 'tour is returned');
  assert.equal(tour.pageKey, 'sharedKey');
  assert.equal(tour.path, '/shared-path');
  assert.equal(tour.steps.length, 1);
  assert.equal(tour.steps[0].selector, '#shared');
});
