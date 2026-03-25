/**
 * Calculates the delay status of a task based on its due date and current status.
 * @param {Object} task - The task object from Mongoose
 * @returns {String} - 'Delayed', 'At Risk', or 'On Track'
 */
exports.calculateDelayStatus = (task) => {
  const now = new Date();
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const completedAt = task.completedAt ? new Date(task.completedAt) : null;

  if (!dueDate) return 'On Track';

  if (task.status === 'done') {
    return completedAt > dueDate ? 'Delayed' : 'On Track';
  }

  if (now > dueDate) {
    return 'Delayed';
  }

  // "At Risk" logic: If less than 24 hours remaining
  const hoursRemaining = (dueDate - now) / (1000 * 60 * 60);
  if (hoursRemaining < 24) {
    return 'At Risk';
  }

  return 'On Track';
};

/**
 * Adds a specified number of business days to a date, skipping weekends.
 * @param {Date} date - The starting date
 * @param {Number} days - The number of business days to add
 * @returns {Date} - The new date
 */
exports.addBusinessDays = (date, days) => {
  const resultDate = new Date(date);
  let daysAdded = 0;
  
  while (daysAdded < days) {
    resultDate.setDate(resultDate.getDate() + 1);
    const dayOfWeek = resultDate.getDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }
  
  return resultDate;
};
