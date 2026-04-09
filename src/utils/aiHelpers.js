// Utility functions for AI response parsing and prompt sanitization.
exports.extractAndParseJSON = (text) => {
  if (!text) return null;

  try {
    // Extract JSON string from potentially unstructured LLM output.
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');

    let jsonStr = '';

    if (
      firstBrace !== -1 &&
      lastBrace !== -1 &&
      (firstBracket === -1 || firstBrace < firstBracket)
    ) {
      jsonStr = text.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonStr = text.substring(firstBracket, lastBracket + 1);
    }

    if (!jsonStr) return null;

    // Strip markdown wrappers and extra formatting artifacts.
    jsonStr = jsonStr
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Fix common trailing comma issues in LLM-generated JSON.
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn(
      `[aiHelpers] Failed to parse AI JSON: ${error.message}. Raw text: ${text.substring(0, 100)}...`
    );
    return null;
  }
};

/**
 * Truncates text based on character estimate to avoid context window overflow.
 * @param {string} text - The input text.
 * @param {number} maxTokens - Maximum allowed tokens (estimated).
 */
exports.truncateToWindow = (text, maxTokens = 4000) => {
  if (!text) return '';
  const maxChars = maxTokens * 4; // Dynamic heuristic
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '... [TRUNCATED]';
};

/**
 * Strips control characters and escapes delimiters used in system prompt templates.
 * Prevents basic system prompt engineering or injection.
 */
exports.sanitizeInput = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .replace(/\[/g, '&#91;') // Escape prompt start delimiter
    .replace(/\]/g, '&#93;') // Escape prompt end delimiter
    .trim();
};

/**
 * Generates a SHA-256 hash for deterministic intent caching.
 */
exports.generateHash = (text) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
};
