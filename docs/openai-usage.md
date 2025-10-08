# OpenAI API Integration

This project includes a small helper module for interacting with the OpenAI API and an optional floating bar UI for experimenting with prompts.

## Setup
1. Install dependencies via `npm install`.
2. Create a `.env` file at the project root containing your API key:
   ```
   OPENAI_API_KEY=sk-...
   ```
3. Start the API server with `npm run serve`.

## Developer Usage
Developers can import the helper function `getResponse` in any server side code:
```js
import { getResponse } from './api-server/utils/openaiClient.js';

const reply = await getResponse('Hello AI');
console.log(reply);
```
This returns the response text from the chat completion API using the key loaded from `.env`.

## End User Interface
The file [`docs/openai-floating-bar.html`](./openai-floating-bar.html) demonstrates a movable floating bar that calls `/api/openai` to fetch a response. The live ERP build includes a React component with the same functionality. The widget can now be collapsed into a small round button so it never blocks important content. Users may drag the bar anywhere on screen, type prompts, and even attach an image or other file. Uploaded files are sent to the API along with the prompt.

The bar adapts to smaller screens and can be reopened via the "AI" button when collapsed.

## Automatic Translation

The front-end utility [`translateWithAI`](../src/erp.mgt.mn/utils/translateWithAI.js) loads strings from the locale files under `src/erp.mgt.mn/locales/`. When a key is missing, it posts the source text to `/api/openai` to request a translation into the desired language. Responses are cached in the browser's `localStorage` using keys of the form `ai-translations-<lang>`. Remove those entries to clear cached translations.

The API route uses the `OPENAI_API_KEY` environment variable shown above; ensure it is set before starting the server so translation requests succeed. If the feature is disabled or the server returns a 404, the helper silently falls back to the source text without showing error toasts.

### Choosing Translation Models

By default, general prompts use the model defined by `OPENAI_MODEL` (falling back to `gpt-3.5-turbo`). You can opt into more capable models without touching front-end code by setting the following environment variables before starting the API server:

| Variable | Purpose |
| --- | --- |
| `OPENAI_TRANSLATION_MODEL` | Overrides the chat model for all AI-powered translations. |
| `OPENAI_TRANSLATION_MODEL_MN` | Overrides the translation model specifically for Mongolian requests. |
| `OPENAI_VALIDATION_MODEL` | Sets the model used to double-check translations for fluency and fidelity. |
| `OPENAI_FILE_MODEL` | Chooses the model used when prompts include uploaded files. |

For example, add the lines below to `.env` to force Mongolian translations to run on GPT-4 quality models:

```
OPENAI_MODEL=gpt-4o-mini
OPENAI_TRANSLATION_MODEL_MN=gpt-4o
OPENAI_VALIDATION_MODEL=gpt-4o
```

Front-end helpers automatically send translation metadata so the API route can pick the right model per language.

### Mongolian Quality Checks

Mongolian translations now undergo additional validation. The browser runs heuristics to flag Latin characters, missing vowels, or suspiciously short phrases. When those checks pass, the client asks the server to re-validate the sentence with OpenAI using the configured `OPENAI_VALIDATION_MODEL`. If the remote validator rejects the translation or reports low confidence, the client retries with targeted feedback until it exhausts the attempt budget. Set `localStorage['ai-translation-debug'] = '1'` in the browser console to view diagnostic logs for each attempt.

## Benchmark Image Lookup

Server code also exposes `findBenchmarkCode` for resolving a transaction type code from an uploaded image name. See [Benchmark Image Verification](./benchmark-image-verification.md) for details.
