# ChatGPT API Integration

This example shows how to connect the Node.js backend to the ChatGPT API using the [openai](https://www.npmjs.com/package/openai) library.

## Installation

Install the OpenAI dependency:

```bash
npm install openai
```

## Usage

Create a module (e.g. `chatgpt.js`) to send a prompt and log the response. Set your OpenAI API key in `.env` as `OPENAI_API_KEY`.

```js
// chatgpt.js
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export async function askChatGPT(prompt) {
  const res = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
  });
  const reply = res.data.choices[0].message.content.trim();
  console.log(reply);
  return reply;
}
```

Call `askChatGPT` from your server code and handle the returned text as needed.
