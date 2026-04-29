const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const logger = require('./logger');

const BLOCKING_THRESHOLD = 50 * 1024; // 50KB threshold for event-loop safety

const sanitizeHTML = (dirty) => {
  if (!dirty || typeof dirty !== 'string') return dirty;

  if (dirty.length > BLOCKING_THRESHOLD) {
    logger.warn(`[PERFORMANCE] Sanitizing large string (${(dirty.length / 1024).toFixed(2)}KB). Potential event-loop blockage.`);
  }
  
  const start = Date.now();
  const sanitized = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
      'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img'
    ],
    ALLOWED_ATTR: ['href', 'name', 'target', 'src', 'alt', 'class', 'style'],
    ALLOWED_SCHEMES: ['http', 'https', 'mailto', 'data']
  });

  const duration = Date.now() - start;
  if (duration > 50) {
    logger.warn(`[PERFORMANCE] Heavy sanitization detected: ${duration}ms for ${dirty.length} chars.`);
  }

  return sanitized;
};

module.exports = { sanitizeHTML };
