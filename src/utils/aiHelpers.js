/**
 * AI Helpers for robust JSON extraction and parsing from LLM outputs.
 */

exports.extractAndParseJSON = (text) => {
  if (!text) return null;

  try {
    // 1. Try to extract content between braces or brackets
    // Finds the first '{' and the last '}' (or '[' and ']')
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

    // 2. Simple sanitization
    // - Remove common LLM markdown artifacts
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // - Fix trailing commas in arrays/objects: [1,2,] -> [1,2]
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn(`[aiHelpers] Failed to parse AI JSON: ${error.message}. Raw text: ${text.substring(0, 100)}...`);
    return null;
  }
};
