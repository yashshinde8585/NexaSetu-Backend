const businessRules = {
  // Staffing, utilization and workload thresholds
  staffing: {
    userWeeklyCapacityMins:
      parseInt(process.env.USER_WEEKLY_CAPACITY_MINS, 10) || 2400, // Default 40 hours
  },

  // Git / pull request parameters
  git: {
    stalePrThresholdMs:
      parseInt(process.env.STALE_PR_THRESHOLD_MS, 10) || 48 * 60 * 60 * 1000, // Default 48 hours
  },

  // Dashboard task and workspace queries limits
  pagination: {
    defaultIcTaskLimit: parseInt(process.env.DEFAULT_IC_TASK_LIMIT, 10) || 10,
  },
};

module.exports = businessRules;
