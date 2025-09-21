import dotenv from 'dotenv';
import OpenAI from 'openai';
import {
  evaluateTranslationCandidate,
  buildValidationPrompt,
  summarizeHeuristic,
} from '../../utils/translationValidation.js';

dotenv.config();

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export default client;

export async function getResponse(prompt) {
  if (!prompt) throw new Error('Prompt is required');
  if (!client) throw new Error('OpenAI client not configured');
  const completion = await client.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0].message.content.trim();
}

export async function getResponseWithFile(prompt, fileBuffer, mimeType) {
  if (!prompt) throw new Error('Prompt is required');
  if (!client) throw new Error('OpenAI client not configured');

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

function parseValidationResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function validateTranslation({ candidate, base, lang, metadata }) {
  const heuristics = evaluateTranslationCandidate({
    candidate,
    base,
    lang,
    metadata,
  });
  const summary = summarizeHeuristic(heuristics);
  const response = {
    valid: false,
    reason: '',
    needsRetry: false,
    strategy: 'heuristic',
    languageConfidence: null,
    heuristics,
    summary,
  };

  if (heuristics.status === 'fail') {
    return {
      ...response,
      reason: heuristics.reasons[0] || 'failed_heuristics',
    };
  }

  if (!client) {
    return {
      ...response,
      valid: heuristics.status === 'pass',
      reason:
        heuristics.status === 'pass'
          ? ''
          : heuristics.reasons[0] || 'validation_unavailable',
      needsRetry: heuristics.status !== 'pass',
      strategy: 'offline',
    };
  }

  if (heuristics.status === 'pass') {
    return {
      ...response,
      valid: true,
      reason: '',
      needsRetry: false,
    };
  }

  const prompt = buildValidationPrompt({ candidate, base, lang, metadata });
  try {
    const raw = await getResponse(prompt);
    const parsed = parseValidationResponse(raw);
    if (!parsed) {
      return {
        ...response,
        reason: 'invalid_validator_response',
        needsRetry: true,
        strategy: 'llm',
      };
    }
    return {
      ...response,
      valid: Boolean(parsed.valid),
      reason: parsed.reason || '',
      needsRetry: parsed.valid ? false : true,
      strategy: 'llm',
      languageConfidence:
        typeof parsed.languageConfidence === 'number'
          ? parsed.languageConfidence
          : null,
    };
  } catch (err) {
    if (err?.response?.status === 429 || err?.rateLimited) {
      const rateErr = new Error('rate limited');
      rateErr.rateLimited = true;
      throw rateErr;
    }
    console.error('LLM validation request failed', err);
    return {
      ...response,
      reason: 'validation_error',
      needsRetry: true,
      strategy: 'llm-error',
    };
  }
}
