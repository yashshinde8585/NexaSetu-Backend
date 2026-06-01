const { parseDate } = require('./common');

// Calculate if a task is Delayed, At Risk, or On Track
exports.calculateDelayStatus = (task, now = new Date()) => {
  const dueDate = parseDate(task.dueDate);
  const completedAt = parseDate(task.completedAt);

  if (!dueDate) return 'On Track';

  if (task.status === 'done') {
    return completedAt > dueDate ? 'Delayed' : 'On Track';
  }

  if (now > dueDate) {
    return 'Delayed';
  }

  const hoursRemaining = (dueDate - now) / (1000 * 60 * 60);
  if (hoursRemaining < 24) {
    return 'At Risk';
  }

  return 'On Track';
};

// Add business days to a date skipping weekends
exports.addBusinessDays = (date, days) => {
  const resultDate = new Date(date);
  let daysAdded = 0;

  while (daysAdded < days) {
    resultDate.setDate(resultDate.getDate() + 1);
    const dayOfWeek = resultDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }

  return resultDate;
};
