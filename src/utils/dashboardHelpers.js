const { parseDate, getDateDiff } = require('./common');

// Format a date to human-readable string (e.g., Today, Tomorrow, Overdue)
exports.formatDueDate = (date, options = {}, now = new Date()) => {
  const d = parseDate(date);
  if (!d) return 'No Date';
  
  const diffDays = Math.ceil(getDateDiff(d, now, 'days'));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 0) return `${Math.abs(diffDays)}d Overdue`;
  
  if (options.relative && diffDays < 7) {
    return `+${diffDays} days`;
  }
  
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};


// Format a date to relative "time ago" string
exports.formatTimeAgo = (date, now = new Date()) => {
  const d = parseDate(date);
  if (!d) return 'unknown';
  
  const seconds = Math.floor(getDateDiff(now, d, 'seconds'));
  
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};


// Calculate progress percentage with safety checks
exports.calculateProgress = (total, completed) => {
  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
};


// Transform task document to dashboard-optimized object
exports.mapTaskToDashboard = (t, now = new Date()) => {
  const dueDate = parseDate(t.dueDate);
  return {
    id: t._id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: exports.formatDueDate(t.dueDate, {}, now),
    isOverdue: dueDate && dueDate < now && t.status !== 'done',
    blocked: t.blocked || (t.dependencies && t.dependencies.length > 0),
    createdAt: t.createdAt,
    createdFormatted: exports.formatDueDate(t.createdAt, {}, now)
  };
};
