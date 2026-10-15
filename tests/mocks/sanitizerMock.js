// Mock for sanitizer in testing environment to avoid jsdom/ESM dependencies
const sanitizeHTML = (dirty) => (typeof dirty === 'string' ? dirty.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') : dirty);

module.exports = { sanitizeHTML };
