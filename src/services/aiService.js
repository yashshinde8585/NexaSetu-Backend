const axios = require('axios');

const ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

// List of available models to try in sequence
const MODEL_FALLBACK_LIST = [
  "mistralai/Mistral-7B-Instruct-v0.3",
  "meta-llama/Llama-3.2-3B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.2"
];

/**
 * Extracts a task from raw text using a prompt.
 * Features a fallback mechanism to handle model availability on the router.
 */
exports.extractTaskFromText = async (text) => {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error('Hugging Face API key is missing. Ensure HUGGINGFACE_API_KEY is set in .env');
  }

  const systemPrompt = `
    You are a task management assistant. Your goal is to extract ONE concise and clear task from the given input text. 
    Map the status based on keywords (e.g., "finished", "completed", "done" -> "done"; "working", "ongoing" -> "in_progress"; default -> "todo").
    
    Return the result ONLY as a JSON object with these fields:
    - title: (short, clear string)
    - description: (brief context, optional string)
    - status: (string, one of: "todo", "in_progress", "done")
  `.trim();

  for (const currentModel of MODEL_FALLBACK_LIST) {
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount < maxRetries) {
      try {
        const response = await axios.post(ROUTER_URL, {
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
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          let status = parsed.status || 'todo';
          if (!['todo', 'in_progress', 'done'].includes(status)) {
              status = 'todo';
          }

          return {
            title: (parsed.title || 'Untitled Task').substring(0, 100),
            description: (parsed.description || '').substring(0, 500),
            status: status,
          };
        } else {
          break; // Try next model
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

        break; // Try next model
      }
    }
  }

  throw new Error('All available AI models failed to process your request. Please check your HUGGINGFACE_API_KEY or connection.');
};
