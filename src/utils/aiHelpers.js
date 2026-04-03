// Core utility for formatting, sanitizing, and structuring generative AI responses.
exports.extractAndParseJSON = (text) => {
  if (!text) return null;

  try {
    // Isolate encapsulated JSON structures systematically from unstructured buffers.
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

    // Strip markdown wrappers and generative formatting artifacts.
    jsonStr = jsonStr
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Apply regex corrections for invalid trailing JSON syntax.
    jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');

    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn(
      `[aiHelpers] Failed to parse AI JSON: ${error.message}. Raw text: ${text.substring(0, 100)}...`
    );
    return null;
  }
};
