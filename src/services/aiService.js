const axios = require('axios');
const aiHelpers = require('../utils/aiHelpers');
const prompts = require('../config/prompts.json');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// AI processing for text extraction and routing.
const MODEL_FALLBACK_LIST = [
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile',
  'mixtral-8x7b-32768',
];

exports.extractTaskFromText = async (text) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Groq API key is missing. Ensure GROQ_API_KEY is set in .env'
    );
  }

  const systemPrompt = prompts.system.TASK_EXTRACTOR + `
    Return the result ONLY as a JSON object with these fields:
    - title: (short, string)
    - status: ("todo", "in_progress", "in_review", "done")
    - priority: ("low", "medium", "high", "urgent")
    - estimatedDuration: (integer minutes)
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
              {
                role: 'user',
                content: `Extract task from this text: "${text}"`,
              },
            ],
            max_tokens: 300,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
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

          return {
            title: (parsed.title || 'Untitled Task').substring(0, 100),
            description: (parsed.description || '').substring(0, 500),
            status: status,
            priority: parsed.priority || 'medium',
            estimatedDuration: parsed.estimatedDuration || 30,
          };
        } else {
          break;
        }
      } catch (error) {
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
          await new Promise((resolve) => setTimeout(resolve, 5000));
          retryCount++;
          if (retryCount >= maxRetries) break;
          continue;
        }

        break;
      }
    }
  }

  throw new Error(
    'All available AI models failed to process your request. Please check your GROQ_API_KEY or connection.'
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

  // Strategic Model Selection
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
