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

## Benchmark Image Lookup

Server code also exposes `findBenchmarkCode` for resolving a transaction type code from an uploaded image name. See [Benchmark Image Verification](./benchmark-image-verification.md) for details.
