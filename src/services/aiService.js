const axios = require('axios');
const aiHelpers = require('../utils/aiHelpers');
const prompts = require('../config/prompts.json');
const { getRedisClient, isRedisConnected } = require('../config/redis');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Tiered fallback models to ensure service availability during upstream outages.
const MODEL_FALLBACK_LIST = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
];

exports.extractTaskFromText = async (text) => {
  let lastError = null;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Groq API key is missing. Ensure GROQ_API_KEY is set in .env'
    );
  }

  // Input sanitization and context windowing.
  const cleanInput = aiHelpers.sanitizeInput(text);
  const chunkedInput = aiHelpers.truncateToWindow(cleanInput, 400);

  // Hash-based caching to prevent redundant LLM execution and reduce latency.
  const intentHash = aiHelpers.generateHash(chunkedInput);
  const cacheKey = `ai:extract:${intentHash}`;
  const redis = getRedisClient();
  
  if (isRedisConnected()) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.warn('[AI-Cache] Retrieval failed, falling back to LLM.');
    }
  }

  // Construct system prompt with schema and few-shot examples.
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

  for (const currentModel of MODEL_FALLBACK_LIST) {
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount < maxRetries) {
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
            temperature: 0.1, // Near-zero for deterministic extraction and strict schema adherence
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 25000,
          }
        );

        const data = response.data;

        const resultText = data.choices[0].message.content;

        // Extract JSON from LLM response.
        const parsed = aiHelpers.extractAndParseJSON(resultText);

        if (parsed) {
          let status = parsed.status || 'todo';
          if (!['todo', 'in_progress', 'in_review', 'done'].includes(status)) {
            status = 'todo';
          }

          const result = {
            title: (parsed.title || 'Untitled Task').substring(0, 100),
            description: (parsed.description || '').substring(0, 500),
            status: status,
            priority: parsed.priority || 'medium',
            type: parsed.type || 'task',
            estimatedDuration: parsed.estimatedDuration || 30,
          };

          // Cache the successful result for 24 hours.
          if (isRedisConnected()) {
            try {
              await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400);
            } catch (e) {
              console.warn('[AI-Cache] Failed to store result.');
            }
          }

          return result;
        } else {
          break;
        }
      } catch (error) {
        lastError = error;
        // Handle unsupported capabilities.
        const res = error.response;
        const data = res?.data;

        if (
          data?.error?.message &&
          (data.error.message.includes('not supported') ||
            data.error.message.includes('is not available'))
        ) {
          break;
        }

        // Handle rate limits and backoff.
        if (
          res?.status === 429 ||
          res?.status === 503 ||
          (data?.error?.message && data.error.message.includes('loading'))
        ) {
          const backoff = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoff));
          retryCount++;
          if (retryCount >= maxRetries) break;
          continue;
        }

        break;
      }
    }
  }

  throw new Error(
    `AI Processing Error: ${lastError?.message || 'All models failed'}`
  );
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

  // Model selection based on reasoning depth requirements.
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
      console.log(`[AI-Performance] Model: ${model} | Latency: ${latency}ms | Tokens: ${response.data.usage?.total_tokens}`);

      return response.data.choices[0].message.content;
    } catch (error) {
      console.warn(`[AI-Fallback] Routing failure on model ${model}, pivoting...`);
      if (model === models[models.length - 1]) throw error;
    }
  }
};
