const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

/**
 * Purifies user-provided HTML/JS to prevent Cross-Site Scripting (XSS) attacks.
 * Essential for rendering Markdown and other complex user-generated content.
 */
const sanitizeHTML = (dirty) => {
  if (!dirty || typeof dirty !== 'string') return dirty;
  
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
      'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'span', 'img'
    ],
    ALLOWED_ATTR: ['href', 'name', 'target', 'src', 'alt', 'class', 'style'],
    ALLOWED_SCHEMES: ['http', 'https', 'mailto', 'data']
  });
};

module.exports = { sanitizeHTML };
