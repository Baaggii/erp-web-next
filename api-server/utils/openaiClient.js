import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getResponse(prompt) {
  if (!prompt) throw new Error('Prompt is required');
  const completion = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0].message.content.trim();
}

export async function getResponseWithFile(prompt, fileBuffer, mimeType) {
  if (!prompt) throw new Error('Prompt is required');

  const messages = [
    {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    },
  ];

  if (fileBuffer) {
    const base64 = fileBuffer.toString('base64');
    messages[0].content.push({
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64}` },
    });
  }

  const completion = await client.chat.completions.create({
    model: 'gpt-4-turbo',
    messages,
  });

  return completion.choices[0].message.content.trim();
}
