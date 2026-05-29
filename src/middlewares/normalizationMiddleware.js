/**
 * Recursively normalizes all input strings to NFC format.
 * Prevents encoding-based security bypasses and ensures uniform database indexing.
 */
const normalizeUnicode = (req, res, next) => {
  const normalize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Normalize to NFC (Canonical Composition)
        obj[key] = obj[key].normalize('NFC').trim();
      } else if (typeof obj[key] === 'object') {
        normalize(obj[key]);
      }
    }
  };

  if (req.body) normalize(req.body);
  if (req.query) normalize(req.query);
  if (req.params) normalize(req.params);

  next();
};

module.exports = normalizeUnicode;
