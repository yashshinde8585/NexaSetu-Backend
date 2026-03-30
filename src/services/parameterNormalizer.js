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

  normalizeStatus(status) {
    if (!status) return null;
    const cleanStatus = status.toLowerCase().replace(/[^a-z_]/g, '');
    return this.STATUS_MAP[cleanStatus] || 'todo';
  }

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

  normalizeString(str) {
      if (!str) return null;
      return str.trim().replace(/^"(.*)"$/, '$1');
  }
}

module.exports = new ParameterNormalizer();
