# OpenAI API Integration

This project includes a small helper module for interacting with the OpenAI API and an optional floating bar UI for experimenting with prompts.

## Setup
1. Install dependencies via `npm install`.
2. Create a `.env` file at the project root containing your API key:
   ```
   OPENAI_API_KEY=sk-...
   ```

## Developer Usage
Developers can import the helper function `getResponse` in any server side code:
```js
import { getResponse } from './api-server/utils/openaiClient.js';

const reply = await getResponse('Hello AI');
console.log(reply);
```
This returns the response text from the chat completion API using the key loaded from `.env`.

## End User Interface
The file [`docs/openai-floating-bar.html`](./openai-floating-bar.html) demonstrates a movable floating bar that calls `/api/openai` to fetch a response. Serve it along with the API server and open it in the browser. Users can type prompts and read the replies directly on the page.

The bar stays visible on every page and can be dragged to any position.
