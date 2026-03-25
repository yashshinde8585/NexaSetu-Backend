const axios = require('axios');
const aiHelpers = require('../utils/aiHelpers');

const ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

// List of available models to try in sequence
const MODEL_FALLBACK_LIST = [
  "mistralai/Mistral-7B-Instruct-v0.3",
  "meta-llama/Llama-3.2-3B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.2"
];

/**
 * Magic Bar Service: Translates Natural Language into Structured System Commands.
 * Enhanced with fallback model support to ensure high availability.
 */
class MagicBarService {
  constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY;
  }

  /**
   * Interprets user input with context awareness and multi-step support.
   */
  async interpretQuery(text, context = {}) {
    if (!this.apiKey) {
      throw new Error('AI API Key missing. Please set HUGGINGFACE_API_KEY in .env');
    }

    const { currentProjects, user } = context;

    const systemPrompt = `
      You are the NLP engine for NexaSetu, an AI Project Orchestrator.
      Convert the user's natural language command into a structured JSON array of actions.
      
      CONTEXT:
      - Current User: ${user ? user.name : 'Unknown'}
      - Projects in Scope: ${currentProjects ? currentProjects.map(p => p.name).join(', ') : 'None'}

      INTENTS:
      - QUERY_TASKS: Fetch tasks. Params: { "status": "todo|in_progress|done", "user": "name", "project": "name" }.
      - SHOW_HEALTH: Get health scores. No params.
      - REASSIGN_TASK: Move work. Params: { "fromUser": "name", "toUser": "name" }.
      - FIX_DELAYS: Optimize timelines. Params: { "project": "name" }.
      - UNKNOWN: Fallback intent.

      RULES FOR ACCURACY:
      1. Map synonyms to strict statuses: "completed" -> "done", "working" -> "in_progress", "todo" -> "todo".
      2. If project mentioned is close to a context project name, use the context name.
      3. For complex commands, return a sequence of actions.
      
      TRAINING EXAMPLES:
      
      Q: "Show my health and fix everything in Project A"
      A: [
        { "intent": "SHOW_HEALTH", "parameters": {}, "responseMessage": "Getting your portfolio health..." },
        { "intent": "FIX_DELAYS", "parameters": { "project": "Project A" }, "responseMessage": "Auto-fixing delayed tasks in Project A." }
      ]

      Q: "Reassign John's tasks to Me"
      A: [
        { "intent": "REASSIGN_TASK", "parameters": { "fromUser": "John", "toUser": "${user ? user.name : 'Me'}" }, "responseMessage": "Preparing reassessment from John..." }
      ]

      Q: "What is the status of completed tasks?"
      A: [
        { "intent": "QUERY_TASKS", "parameters": { "status": "done" }, "responseMessage": "Finding all completed items." }
      ]
    `.trim();

    for (const currentModel of MODEL_FALLBACK_LIST) {
      try {
        const response = await axios.post(ROUTER_URL, {
          model: currentModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Interpret this command: "${text}"` }
          ],
          max_tokens: 500,
          temperature: 0.1,
        }, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });

        const resultText = response.data.choices[0].message.content;
        const actions = aiHelpers.extractAndParseJSON(resultText);
        
        if (actions) {
          return Array.isArray(actions) ? actions : [actions];
        }
      } catch (error) {
        console.error(`[MagicBarService] error with ${currentModel}:`, error.message);
      }
    }

    return [{ 
      intent: 'UNKNOWN', 
      responseMessage: "I'm having trouble understanding those steps. Could you try one at a time?" 
    }];
  }
}

module.exports = new MagicBarService();
