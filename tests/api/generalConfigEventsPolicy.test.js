import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_ADMIN_USER = process.env.DB_ADMIN_USER || 'test';
process.env.DB_ADMIN_PASS = process.env.DB_ADMIN_PASS || 'test';
process.env.ERP_ADMIN_USER = process.env.ERP_ADMIN_USER || 'test';
process.env.ERP_ADMIN_PASS = process.env.ERP_ADMIN_PASS || 'test';

test('eventsPolicy toggles are coerced correctly on update/read', { concurrency: false }, async () => {
  const { getGeneralConfig, updateGeneralConfig } = await import('../../api-server/services/generalConfig.js');
  const { config: before } = await getGeneralConfig();
  const original = {
    operationsEnabled: before.eventsPolicy?.operationsEnabled,
    eventToastEnabled: before.eventsPolicy?.eventToastEnabled,
    policyToastEnabled: before.eventsPolicy?.policyToastEnabled,
  };

  try {
    const saved = await updateGeneralConfig({
      eventsPolicy: {
        operationsEnabled: '1',
        eventToastEnabled: 'true',
        policyToastEnabled: 'false',
      },
    });

    assert.equal(saved.eventsPolicy?.operationsEnabled, true);
    assert.equal(saved.eventsPolicy?.eventToastEnabled, true);
    assert.equal(saved.eventsPolicy?.policyToastEnabled, false);

    const { config: after } = await getGeneralConfig();
    assert.equal(after.eventsPolicy?.operationsEnabled, true);
    assert.equal(after.eventsPolicy?.eventToastEnabled, true);
    assert.equal(after.eventsPolicy?.policyToastEnabled, false);
  } finally {
    await updateGeneralConfig({ eventsPolicy: original });
  }
});

test('eventsPolicy.operationsEnabled enables event operations globally', { concurrency: false }, async () => {
  const { getGeneralConfig, updateGeneralConfig } = await import('../../api-server/services/generalConfig.js');
  const { isEventEngineEnabled } = await import('../../api-server/services/eventEngineConfigService.js');
  const { config: before } = await getGeneralConfig();
  const original = before.eventsPolicy?.operationsEnabled;

  try {
    await updateGeneralConfig({ eventsPolicy: { operationsEnabled: true } });

    const enabled = await isEventEngineEnabled({
      query: async () => {
        throw new Error('db should not be required when operationsEnabled is true');
      },
    });

    assert.equal(enabled, true);
  } finally {
    await updateGeneralConfig({ eventsPolicy: { operationsEnabled: original } });
  }
});

test('eventsPolicy.operationsEnabled=false disables event operations globally', { concurrency: false }, async () => {
  const { getGeneralConfig, updateGeneralConfig } = await import('../../api-server/services/generalConfig.js');
  const { isEventEngineEnabled } = await import('../../api-server/services/eventEngineConfigService.js');
  const { config: before } = await getGeneralConfig();
  const original = before.eventsPolicy?.operationsEnabled;

  try {
    process.env.EVENT_ENGINE_ENABLED = 'true';
    await updateGeneralConfig({ eventsPolicy: { operationsEnabled: false } });

    const enabled = await isEventEngineEnabled({
      query: async () => [[{ event_engine_enabled: 1 }]],
    });

    assert.equal(enabled, false);
  } finally {
    delete process.env.EVENT_ENGINE_ENABLED;
    await updateGeneralConfig({ eventsPolicy: { operationsEnabled: original } });
  }
});
