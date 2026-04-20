// Normalize role strings to standard uppercase
exports.normalizeRole = (role) => (role || '').trim().toUpperCase();

// Normalize job titles to standard uppercase
exports.normalizeJobTitle = (title) => (title || '').trim().toUpperCase();

// Safely parse a value into a Date object
exports.parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};


// Calculate difference between two dates in specified units
exports.getDateDiff = (date1, date2, unit = 'days') => {
  const diffMs = date1.getTime() - date2.getTime();
  const conversions = {
    days: 1000 * 60 * 60 * 24,
    hours: 1000 * 60 * 60,
    minutes: 1000 * 60,
    seconds: 1000
  };
  return diffMs / (conversions[unit] || 1);
};
