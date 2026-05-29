const axios = require('axios');
const logger = require('./logger');
const { getRequestId } = require('./context');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_TIMEOUT = 25000;
const BACKOFF_MULTIPLIER = 1000;
const MAX_RETRIES = 2;

const MODEL_FALLBACK_LIST = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
];

const apiKey = process.env.GROQ_API_KEY;
const baseUrl = GROQ_URL;

const generateCompletion = async (messages, options = {}) => {
  if (!apiKey) {
    throw new Error('AI API Key missing. Please set GROQ_API_KEY in .env');
  }

  const {
    models = MODEL_FALLBACK_LIST,
    temperature = 0.1,
    max_tokens = 600,
    signal = null,
    timeout = DEFAULT_TIMEOUT,
  } = options;

  let lastError = null;

  for (const currentModel of models) {
    if (signal?.aborted) throw new Error('Request aborted by client');

    let retryCount = 0;
    while (retryCount < MAX_RETRIES) {
      if (signal?.aborted) throw new Error('Request aborted by client');

      try {
        const response = await axios.post(
          baseUrl,
          {
            model: currentModel,
            messages,
            max_tokens,
            temperature,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'X-Request-ID': getRequestId(),
            },
            timeout,
            signal,
          }
        );

        logger.info(
          `[AI-Client] Success | Model: ${currentModel} | Tokens: ${response.data.usage?.total_tokens}`
        );

        return {
          content: response.data.choices[0].message.content,
          usage: response.data.usage,
          model: currentModel,
        };
      } catch (error) {
        lastError = error;

        if (axios.isCancel(error) || error.name === 'AbortError') {
          throw new Error('AI request cancelled');
        }

        const isTimeout =
          error.code === 'ECONNABORTED' || error.message.includes('timeout');
        const res = error.response;
        const data = res?.data;

        if (
          data?.error?.message &&
          (data.error.message.includes('not supported') ||
            data.error.message.includes('is not available'))
        ) {
          break;
        }

        if (
          isTimeout ||
          res?.status === 429 ||
          res?.status === 503 ||
          (data?.error?.message && data.error.message.includes('loading'))
        ) {
          const backoff =
            Math.pow(2, retryCount) * BACKOFF_MULTIPLIER + Math.random() * 1000;
          logger.warn(
            `[AI-Client-Retry] ${currentModel} failed (${isTimeout ? 'Timeout' : res?.status}). Retrying in ${Math.round(backoff)}ms...`
          );

          await new Promise((resolve) => {
            const timer = setTimeout(resolve, backoff);
            signal?.addEventListener('abort', () => clearTimeout(timer));
          });
          retryCount++;
          continue;
        }

        break;
      }
    }
  }

  throw new Error(
    `AI Provider Error: ${lastError?.message || 'All models failed'}`
  );
};

const getFallbackModels = () => MODEL_FALLBACK_LIST;

module.exports = {
  generateCompletion,
  getFallbackModels,
};
