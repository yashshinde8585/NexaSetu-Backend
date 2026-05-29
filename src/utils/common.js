exports.normalizeRole = (role) => (role || '').trim().toUpperCase();

exports.normalizeJobTitle = (title) => (title || '').trim().toUpperCase();

exports.parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

exports.getDateDiff = (date1, date2, unit = 'days') => {
  const diffMs = date1.getTime() - date2.getTime();
  const conversions = {
    days: 1000 * 60 * 60 * 24,
    hours: 1000 * 60 * 60,
    minutes: 1000 * 60,
    seconds: 1000,
  };
  return diffMs / (conversions[unit] || 1);
};
