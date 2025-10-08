import { test } from 'node:test';
import assert from 'node:assert';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_TRANSLATION_MODEL;
  delete process.env.OPENAI_TRANSLATION_MODEL_MN;
  delete process.env.OPENAI_VALIDATION_MODEL;
  delete process.env.OPENAI_FILE_MODEL;
}

test('selectTranslationModel falls back to defaults', async () => {
  resetEnv();
  const { selectTranslationModel, selectValidationModel } = await import(
    '../../api-server/utils/openaiClient.js?default'
  );
  assert.strictEqual(selectTranslationModel('mn'), 'gpt-3.5-turbo');
  assert.strictEqual(selectTranslationModel('de'), 'gpt-3.5-turbo');
  assert.strictEqual(selectValidationModel(), 'gpt-3.5-turbo');
});

test('selectTranslationModel respects overrides', async () => {
  resetEnv();
  process.env.OPENAI_MODEL = 'gpt-4o-mini';
  process.env.OPENAI_TRANSLATION_MODEL = 'gpt-4o-mini';
  process.env.OPENAI_TRANSLATION_MODEL_MN = 'gpt-4o';
  process.env.OPENAI_VALIDATION_MODEL = 'gpt-4.1-mini';

  const { selectTranslationModel, selectValidationModel } = await import(
    '../../api-server/utils/openaiClient.js?overrides'
  );
  assert.strictEqual(selectTranslationModel('mn'), 'gpt-4o');
  assert.strictEqual(selectTranslationModel('fr'), 'gpt-4o-mini');
  assert.strictEqual(selectValidationModel(), 'gpt-4.1-mini');
});

test('validation falls back to translation override when none provided', async () => {
  resetEnv();
  process.env.OPENAI_TRANSLATION_MODEL = 'gpt-4o-mini';
  const { selectValidationModel } = await import(
    '../../api-server/utils/openaiClient.js?validationfallback'
  );
  assert.strictEqual(selectValidationModel(), 'gpt-4o-mini');
});

test('mn override is optional', async () => {
  resetEnv();
  process.env.OPENAI_TRANSLATION_MODEL = 'gpt-4o-mini';
  const { selectTranslationModel } = await import(
    '../../api-server/utils/openaiClient.js?no-mn-override'
  );
  assert.strictEqual(selectTranslationModel('mn'), 'gpt-4o-mini');
});

test('restores environment after tests', () => {
  Object.assign(process.env, ORIGINAL_ENV);
});
