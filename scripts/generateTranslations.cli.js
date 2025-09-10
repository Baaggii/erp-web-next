#!/usr/bin/env node
import {
  generateTranslations,
  generateTooltipTranslations,
} from './generateTranslations.js';

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());

process.on('unhandledRejection', (err) => {
  console.error('[gen-i18n] UNHANDLED REJECTION', err);
  process.exit(2);
});
process.on('uncaughtException', (err) => {
  console.error('[gen-i18n] UNCAUGHT EXCEPTION', err);
  process.exit(3);
});

async function main() {
  try {
    const textsPath = process.argv[2];
    await generateTranslations({
      onLog: console.log,
      signal: controller.signal,
      textsPath,
    });
    await generateTooltipTranslations({ onLog: console.log, signal: controller.signal });
  } catch (err) {
    console.error('[gen-i18n] FATAL', err);
    process.exit(1);
  }
}

main();
