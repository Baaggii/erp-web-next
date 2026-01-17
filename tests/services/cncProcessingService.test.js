import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const svgFixture = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
  <path d="M0 0 L10 0 L10 10 L0 10 Z" />
</svg>`;

if (typeof mock.import !== 'function') {
  test('processCncFile applies material scaling and tool defaults', { skip: true }, () => {});
} else {
  test('processCncFile applies material scaling and tool defaults', async () => {
    const { processCncFile } = await mock.import(
      '../../api-server/services/cncProcessingService.js',
      {
        potrace: {
          default: {
            trace: () => {},
          },
        },
      },
    );
    const file = {
      originalname: 'sample.svg',
      mimetype: 'image/svg+xml',
      buffer: Buffer.from(svgFixture),
    };

    const result = await processCncFile({
      file,
      outputFormat: 'gcode',
      options: {
        materialWidthMm: 120,
        materialHeightMm: 80,
        materialThicknessMm: 12,
        outputWidthMm: 60,
        outputHeightMm: 40,
        keepAspectRatio: false,
        toolId: 'ball-3',
        cutDepthMm: -2,
        safeHeightMm: 5,
      },
    });

    try {
      assert.equal(result.material.widthMm, 120);
      assert.equal(result.material.heightMm, 80);
      assert.equal(result.material.thicknessMm, 12);
      assert.equal(result.output.widthMm, 60);
      assert.equal(result.output.heightMm, 40);
      assert.ok(result.output.scale);

      const gcode = await fs.readFile(result.path, 'utf8');
      assert.ok(gcode.includes('M3 S14000.000'));
      assert.ok(gcode.includes('F280.000'));
      assert.ok(gcode.includes('F800.000'));
    } finally {
      await fs.rm(result.path, { force: true });
      mock.restoreAll();
    }
  });
}
