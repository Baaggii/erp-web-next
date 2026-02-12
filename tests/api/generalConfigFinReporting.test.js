import test from 'node:test';
import assert from 'node:assert/strict';
import { getGeneralConfig, updateGeneralConfig } from '../../api-server/services/generalConfig.js';

await test('updateGeneralConfig persists finReporting.showJournalActionDebug', { concurrency: false }, async () => {
  const { config: before } = await getGeneralConfig();
  const original = Boolean(before.finReporting?.showJournalActionDebug);
  const toggled = !original;

  try {
    const saved = await updateGeneralConfig({
      finReporting: { showJournalActionDebug: toggled },
    });
    assert.equal(saved.finReporting?.showJournalActionDebug, toggled);

    const { config: after } = await getGeneralConfig();
    assert.equal(after.finReporting?.showJournalActionDebug, toggled);
  } finally {
    await updateGeneralConfig({
      finReporting: { showJournalActionDebug: original },
    });
  }
});
