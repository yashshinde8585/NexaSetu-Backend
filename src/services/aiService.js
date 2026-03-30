const axios = require('axios');
const aiHelpers = require('../utils/aiHelpers');

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// High-speed Groq models for instant task extraction
const MODEL_FALLBACK_LIST = [
  "llama-3.1-8b-instant",
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768"
];

exports.extractTaskFromText = async (text) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('Groq API key is missing. Ensure GROQ_API_KEY is set in .env');
  }

  const systemPrompt = `
    You are a task management assistant. Your goal is to extract ONE concise and clear task from the given input text. 
    Map the status based on keywords (e.g., "finished", "completed", "done" -> "done"; "verifying", "reviewing" -> "in_review"; "working", "ongoing" -> "in_progress"; default -> "todo").
    
    Return the result ONLY as a JSON object with these fields:
    - title: (short, clear string)
    - description: (brief context, optional string)
    - status: (string, one of: "todo", "in_progress", "in_review", "done")
  `.trim();

  for (const currentModel of MODEL_FALLBACK_LIST) {
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount < maxRetries) {
      try {
        const response = await axios.post(GROQ_URL, {
          model: currentModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Extract task from this text: "${text}"` }
          ],
          max_tokens: 300,
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10s timeout
        });

        const data = response.data;

        const resultText = data.choices[0].message.content;

        // Try to parse the JSON output from the AI
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
          };
        } else {
          break;
        }

      } catch (error) {
        // Handle "Not Supported" error - try next model in fallback list
        const res = error.response;
        const data = res?.data;

        if (data?.error?.message && (data.error.message.includes("not supported") || data.error.message.includes("is not available"))) {
          break; // Exit while loop, try next model
        }

        // Handle rate limiting or model loading
        if (res?.status === 429 || res?.status === 503 || (data?.error?.message && data.error.message.includes("loading"))) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          retryCount++;
          if (retryCount >= maxRetries) break; 
          continue;
        }

        break;
      }
    }
  }

  throw new Error('All available AI models failed to process your request. Please check your GROQ_API_KEY or connection.');
};


exports.processPrompt = async (prompt) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  try {
    const response = await axios.post(GROQ_URL, {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('[AIService] Failed strategic processing:', error);
    throw error;
  }
};

