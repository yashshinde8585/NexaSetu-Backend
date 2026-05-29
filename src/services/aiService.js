const aiClient = require('../utils/aiClient');
const CircuitBreaker = require('opossum');
const aiHelpers = require('../utils/aiHelpers');
const prompts = require('../config/prompts.json');
const { isRedisConnected } = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_EXPIRATION = 86400;

const { cacheManager } = require('../middlewares/cacheMiddleware');

const getCachedIntent = async (hash, workspaceId = 'global') => {
  if (!isRedisConnected()) return null;
  const cacheKey = cacheManager.generateKey(
    workspaceId,
    'ai',
    `extract:${hash}`
  );
  const legacyKey = `ai:extract:${hash}`;

  return await cacheManager.getWithFallback(cacheKey, legacyKey);
};

const breakerOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

const aiBreaker = new CircuitBreaker(
  (messages, options) => aiClient.generateCompletion(messages, options),
  breakerOptions
);

aiBreaker.fallback(() => {
  throw new Error(
    'AI Service is currently throttled or unavailable. Please try again later.'
  );
});

aiBreaker.on('open', () =>
  logger.warn('[AI-Breaker] Circuit opened - pivoting to fallback mode')
);
aiBreaker.on('close', () =>
  logger.info('[AI-Breaker] Circuit closed - AI services restored')
);

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

const trackUsage = async (workspaceId, usage) => {
  if (!isRedisConnected() || !usage) return;

  const date = new Date().toISOString().split('T')[0];
  const key = `ai_usage:${workspaceId}:${date}`;

  try {
    const { getRedisClient } = require('../config/redis');
    const redis = getRedisClient();
    const tokens = await redis.hincrby(
      key,
      'total_tokens',
      usage.total_tokens || 0
    );
    await redis.hincrby(key, 'call_count', 1);
    await redis.expire(key, 172800);

    if (tokens > 50000 && tokens - (usage.total_tokens || 0) <= 50000) {
      logger.warn(
        `[AI-Cost] Soft limit exceeded for workspace ${workspaceId}: ${tokens} tokens today.`
      );
    }
  } catch (err) {
    logger.warn('[AI-Cost] Failed to track usage: %s', err.message);
  }
};

exports.extractTaskFromText = async (text, signal = null) => {
  const cleanInput = aiHelpers.sanitizeInput(text);
  const chunkedInput = aiHelpers.truncateToWindow(cleanInput, 400);

  const intentHash = aiHelpers.generateHash(
    `${chunkedInput}|len:${text.length}`
  );

  const cachedResult = await getCachedIntent(intentHash);
  if (cachedResult) return cachedResult;

  const messages = [
    {
      role: 'system',
      content: `${prompts.system.TASK_EXTRACTOR}\n\n### SCHEMA\nReturn ONLY JSON:\n${prompts.templates.TASK_EXTRACTION_SCHEMA}\n\n### EXAMPLES\n${prompts.templates.FEW_SHOT_TASKS}`,
    },
    {
      role: 'user',
      content: `Context: [${chunkedInput}]\n\nAction: Synthesize task JSON.`,
    },
  ];

  const response = await aiBreaker.fire(messages, { signal });
  const result = parseAndFormatAIResponse(response.content);

  if (!result) {
    throw new Error('AI Processing Error: Failed to parse mission parameters');
  }

  if (isRedisConnected()) {
    const cacheKey = cacheManager.generateKey(
      'global',
      'ai',
      `extract:${intentHash}`
    );
    cacheManager.set(cacheKey, result, CACHE_EXPIRATION).catch(() => {});
    trackUsage('global', response.usage);
  }

  return result;
};

exports.processPrompt = async (systemPrompt, userPrompt, config = {}) => {
  const {
    highReasoning = false,
    temperature = 0.5,
    max_tokens = 800,
    timeout = 15000,
    workspaceId = 'global',
  } = config;

  const primaryModel = highReasoning
    ? 'llama-3.3-70b-versatile'
    : 'llama-3.1-8b-instant';
  const models = [
    primaryModel,
    ...aiClient.getFallbackModels().filter((m) => m !== primaryModel),
  ];

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await aiClient.generateCompletion(messages, {
    models,
    temperature,
    max_tokens,
    timeout,
  });

  trackUsage(workspaceId, response.usage);
  return response.content;
};
