/**
 * Parameter Normalizer: Centralized logic for normalizing AI-extracted parameters.
 * Ensures that human-friendly terms are converted into strict system values.
 */

class ParameterNormalizer {
  constructor() {
    this.STATUS_MAP = {
      'completed': 'done',
      'finished': 'done',
      'closed': 'done',
      'resolved': 'done',
      'working': 'in_progress',
      'ongoing': 'in_progress',
      'active': 'in_progress',
      'started': 'in_progress',
      'reviewing': 'in_review',
      'verifying': 'in_review',
      'testing': 'in_review',
      'inreview': 'in_review',
      'todo': 'todo',
      'waiting': 'todo',
      'backlog': 'todo'
    };
  }

  /**
   * Normalizes task status based on common synonyms
   */
  normalizeStatus(status) {
    if (!status) return null;
    const cleanStatus = status.toLowerCase().replace(/[^a-z_]/g, '');
    return this.STATUS_MAP[cleanStatus] || 'todo';
  }

  /**
   * Normalizes dates (converts relative terms to Absolute JS Dates)
   * Note: This is a simplified version; in a real app, use a library like chrono-node.
   */
  normalizeDate(dateStr) {
    if (!dateStr) return null;
    const now = new Date();
    
    if (dateStr.toLowerCase().includes('tomorrow')) {
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
    if (dateStr.toLowerCase().includes('next week')) {
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Cleans up string parameters (strips fluff)
   */
  normalizeString(str) {
      if (!str) return null;
      return str.trim().replace(/^"(.*)"$/, '$1'); // Remove surrounding quotes
  }
}

module.exports = new ParameterNormalizer();
