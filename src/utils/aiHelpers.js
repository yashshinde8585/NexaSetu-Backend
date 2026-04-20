const crypto = require('crypto');


// Extract and parse JSON from unstructured AI text responses
exports.extractAndParseJSON = (text) => {
  if (!text || typeof text !== 'string') return null;

  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');

    let jsonStr = '';

    if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      jsonStr = text.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket !== -1) {
      jsonStr = text.substring(firstBracket, lastBracket + 1);
    }

    if (!jsonStr) return null;

    // Sanitize the potential JSON string
    const cleanStr = jsonStr
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/,\s*([\]}])/g, '$1') // Fix trailing commas
      .trim();

    return JSON.parse(cleanStr);
  } catch (error) {
    return null;
  }
};


// Truncate text to fit within AI model context windows
exports.truncateToWindow = (text, maxTokens = 4000) => {
  if (!text) return '';
  const maxChars = maxTokens * 4;
  return text.length <= maxChars ? text : text.substring(0, maxChars) + '... [TRUNCATED]';
};


// Sanitize input to prevent prompt injection and control character issues
exports.sanitizeInput = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .trim();
};


// Generate a deterministic SHA-256 hash for data identification
exports.generateHash = (text) => {
  if (!text) return '';
  return crypto.createHash('sha256').update(text).digest('hex');
};
