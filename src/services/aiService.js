const axios = require('axios');
const aiHelpers = require('../utils/aiHelpers');
const prompts = require('../config/prompts.json');
const { getRedisClient, isRedisConnected } = require('../config/redis');
const logger = require('../utils/logger');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_TIMEOUT = 25000;
const CACHE_EXPIRATION = 86400;
const BACKOFF_MULTIPLIER = 1000;
const MAX_RETRIES = 2;

// Tiered fallback models to ensure service availability during upstream outages.
const MODEL_FALLBACK_LIST = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
];


const getCachedIntent = async (hash) => {
  if (!isRedisConnected()) return null;
  const cacheKey = `ai:extract:${hash}`;
  const redis = getRedisClient();
  try {
    const cached = await redis.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    logger.warn('[AI-Cache] Retrieval failed, falling back to LLM.');
    return null;
  }
};

const executeWithRetry = async (models, systemPrompt, userPrompt) => {
  const apiKey = process.env.GROQ_API_KEY;
  let lastError = null;

  for (const currentModel of models) {
    let retryCount = 0;
    while (retryCount < MAX_RETRIES) {
      try {
        const response = await axios.post(
          GROQ_URL,
          {
            model: currentModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_tokens: 600,
            temperature: 0.1,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: DEFAULT_TIMEOUT,
          }
        );
        return response.data.choices[0].message.content;
      } catch (error) {
        lastError = error;
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
          res?.status === 429 ||
          res?.status === 503 ||
          (data?.error?.message && data.error.message.includes('loading'))
        ) {
          const backoff = Math.pow(2, retryCount) * BACKOFF_MULTIPLIER + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoff));
          retryCount++;
          continue;
        }
        break;
      }
    }
  }
  throw new Error(`AI Processing Error: ${lastError?.message || 'All models failed'}`);
};

const parseAndFormatAIResponse = (text) => {
  const parsed = aiHelpers.extractAndParseJSON(text);
  if (!parsed) return null;

  let status = parsed.status || 'todo';
  const validStatuses = ['todo', 'in_progress', 'in_review', 'done'];
  if (!validStatuses.includes(status)) {
    status = 'todo';
  }

  return {
    title: (parsed.title || 'Untitled Task').substring(0, 100),
    description: (parsed.description || '').substring(0, 500),
    status: status,
    priority: parsed.priority || 'medium',
    type: parsed.type || 'task',
    estimatedDuration: parsed.estimatedDuration || 30,
  };
};

exports.extractTaskFromText = async (text) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API key is missing. Ensure GROQ_API_KEY is set in .env');
  }

  const cleanInput = aiHelpers.sanitizeInput(text);
  const chunkedInput = aiHelpers.truncateToWindow(cleanInput, 400);
  const intentHash = aiHelpers.generateHash(chunkedInput);

  const cachedResult = await getCachedIntent(intentHash);
  if (cachedResult) return cachedResult;

  const systemPrompt = `
    ${prompts.system.TASK_EXTRACTOR}
    
    ### SCHEMA
    Return ONLY JSON that adheres to this schema exactly:
    ${prompts.templates.TASK_EXTRACTION_SCHEMA}
    
    ### EXAMPLES
    ${prompts.templates.FEW_SHOT_TASKS}
  `.trim();

  const userPrompt = `
    [USER_CONTEXT_START]
    ${chunkedInput}
    [USER_CONTEXT_END]
    
    Action: Analyze the context within [USER_CONTEXT] and synthesize a task JSON as per the schema.
  `.trim();

  const rawResponse = await executeWithRetry(MODEL_FALLBACK_LIST, systemPrompt, userPrompt);
  const result = parseAndFormatAIResponse(rawResponse);

  if (!result) {
    throw new Error('AI Processing Error: Failed to parse mission parameters');
  }

  // Handle caching as a side-effect to keep the main flow flat.
  if (isRedisConnected()) {
    const cacheKey = `ai:extract:${intentHash}`;
    getRedisClient().set(cacheKey, JSON.stringify(result), 'EX', CACHE_EXPIRATION)
      .catch(e => logger.warn('[AI-Cache] Failed to store result: %s', e.message));
  }

  return result;
};

exports.processPrompt = async (systemPrompt, userPrompt, config = {}) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const {
    highReasoning = false,
    temperature = 0.5,
    max_tokens = 800,
    timeout = 15000
  } = config;

  const primaryModel = highReasoning ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
  const models = [primaryModel, ...MODEL_FALLBACK_LIST.filter(m => m !== primaryModel)];

  for (const model of models) {
    const start = Date.now();
    try {
      const response = await axios.post(
        GROQ_URL,
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout,
        }
      );

      const latency = Date.now() - start;
      logger.info(`[AI-Performance] Model: ${model} | Latency: ${latency}ms | Tokens: ${response.data.usage?.total_tokens}`);

      return response.data.choices[0].message.content;
    } catch (error) {
      logger.warn(`[AI-Fallback] Routing failure on model ${model}, pivoting...`);
      if (model === models[models.length - 1]) throw error;
    }
  }
};
