/**
 * Utility functions for dashboard data formatting and mapping.
 */

/**
 * Format a date into a human-readable due date string
 * @param {Date} date 
 * @param {Object} options - { relative: boolean }
 * @returns {string}
 */
exports.formatDueDate = (date, options = {}) => {
  if (!date) return 'No Date';
  const now = new Date();
  const d = new Date(date);
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return `${Math.abs(diffDays)}d Overdue`;
  
  if (options.relative && diffDays < 7) {
    return `+${diffDays} days`;
  }
  
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};


/**
 * Format a date into a "time ago" string
 * @param {Date} date 
 * @returns {string}
 */
exports.formatTimeAgo = (date) => {
  const d = new Date(date);
  const seconds = Math.floor((new Date() - d) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Calculate progress percentage safely
 * @param {number} total 
 * @param {number} completed 
 * @returns {Object}
 */
exports.calculateProgress = (total, completed) => {
  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
};

/**
 * Map a task document to a standard dashboard task object
 * @param {Object} t - Task document
 * @returns {Object}
 */
exports.mapTaskToDashboard = (t) => {
  return {
    id: t._id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: exports.formatDueDate(t.dueDate),
    isOverdue: t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done',
    blocked: t.blocked || (t.dependencies && t.dependencies.length > 0),
    createdAt: t.createdAt,
    createdFormatted: exports.formatDueDate(t.createdAt)
  };
};
