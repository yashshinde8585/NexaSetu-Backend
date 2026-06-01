/**
 * NexaSetu Dashboard Presenter / DTO Mapper
 * Separates presentation details (styling, colors, default templates) from business calculations.
 */

const { formatTimeAgo } = require('./dashboardHelpers');

/**
 * Maps raw gamification scores into badge presentation models.
 */
exports.getBadgesPresenter = (xp, prsMerged, totalTasks, doneBugs) => {
  return [
    {
      title: 'Quick Learner',
      date: xp >= 100 ? 'Earned recently' : 'Locked',
      iconName: 'Zap',
      color: xp >= 100 ? 'text-secondary' : 'text-text-subtle',
      bg: xp >= 100 ? 'bg-secondary/10' : 'bg-background-elevated',
      border: xp >= 100 ? 'border-secondary/30' : 'border-border',
    },
    {
      title: 'First PR',
      date: prsMerged > 0 ? 'Earned recently' : 'Locked',
      iconName: 'GitPullRequest',
      color: prsMerged > 0 ? 'text-status-success' : 'text-text-subtle',
      bg: prsMerged > 0 ? 'bg-status-success/10' : 'bg-background-elevated',
      border: prsMerged > 0 ? 'border-status-success/30' : 'border-border',
    },
    {
      title: 'Team Player',
      date: totalTasks > 0 ? 'Earned recently' : 'Locked',
      iconName: 'Users',
      color: totalTasks > 0 ? 'text-status-warning' : 'text-text-subtle',
      bg: totalTasks > 0 ? 'bg-status-warning/10' : 'bg-background-elevated',
      border: totalTasks > 0 ? 'border-status-warning/30' : 'border-border',
    },
    {
      title: 'Bug Hunter',
      date: doneBugs > 0 ? 'Earned recently' : 'Locked',
      iconName: 'Lock',
      color: doneBugs > 0 ? 'text-status-error' : 'text-text-subtle',
      bg: doneBugs > 0 ? 'bg-status-error/10' : 'bg-background-elevated',
      border: doneBugs > 0 ? 'border-status-error/30' : 'border-border',
    },
  ];
};

/**
 * Maps task warnings/limits into tips lists for engineers.
 */
exports.getTipsPresenter = (blockedCount, codeHealthScore, coverage) => {
  const list = [];
  if (blockedCount > 0) {
    list.push({
      title: 'Unblock your tasks',
      desc: 'Sync with your mentor to clear blockers on your assigned items.',
      color: 'text-status-error',
    });
  }
  if (codeHealthScore < 90) {
    list.push({
      title: 'Improve code health',
      desc: 'Look for code smells or ESLint issues in your modules to refactor.',
      color: 'text-status-warning',
    });
  }
  if (coverage < 80) {
    list.push({
      title: 'Add test coverage',
      desc: 'Write unit tests to cover missing pathways in your codebase.',
      color: 'text-primary',
    });
  }
  if (list.length < 3) {
    list.push({
      title: 'Sync with Mentor',
      desc: 'Schedule a quick 1-on-1 with your mentor to align on sprint targets.',
      color: 'text-secondary',
    });
  }
  return list.slice(0, 3);
};

/**
 * Returns the default base DTO structure for tactical leadership widgets.
 */
exports.getTacticalBasePresenter = (activity) => {
  return {
    sprintControl: {
      progress: 0,
      delayRisk: 'LOW',
      blockedTasks: 0,
      teamLoad: 0,
      tasksDueToday: 0,
    },
    taskBoard: [],
    blockers: [],
    teamWorkload: [],
    burndown: { planned: 0, completed: 0, remaining: 0, daysLeft: 0 },
    activity: activity || [],
    focusToday: [],
    distribution: { backend: 0, frontend: 0, qa: 0, other: 0, imbalance: null },
  };
};

/**
 * Formats QA defects breakdown and chart configurations.
 */
exports.getDefectsByStatusPresenter = (bugs) => {
  const defects = [
    {
      name: 'New',
      value: bugs.filter((b) => b.status === 'todo').length,
      color: 'var(--color-status-error)',
    },
    {
      name: 'In Progress',
      value: bugs.filter((b) => b.status === 'in_progress').length,
      color: 'var(--color-status-warning)',
    },
    {
      name: 'Reopened',
      value: bugs.filter((b) => b.status === 'blocked').length,
      color: 'var(--color-secondary)',
    },
    {
      name: 'Resolved',
      value: bugs.filter((b) => ['done', 'approved'].includes(b.status)).length,
      color: 'var(--color-primary)',
    },
  ];

  const total = defects.reduce((sum, item) => sum + item.value, 0);
  defects.forEach((item) => {
    item.percentage =
      total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0;
  });

  return {
    defects,
    total,
  };
};

/**
 * Formats overall SQA execution stats.
 */
exports.getTestExecutionSummaryPresenter = (
  passed,
  failed,
  blocked,
  pending
) => {
  const total = passed + failed + blocked + pending;
  return [
    {
      name: 'Passed',
      value: passed,
      percentage: total ? Math.round((passed / total) * 1000) / 10 : 0,
      color: 'var(--color-status-success)',
    },
    {
      name: 'Failed',
      value: failed,
      percentage: total ? Math.round((failed / total) * 1000) / 10 : 0,
      color: 'var(--color-status-error)',
    },
    {
      name: 'Blocked',
      value: blocked,
      percentage: total ? Math.round((blocked / total) * 1000) / 10 : 0,
      color: 'var(--color-status-warning)',
    },
    {
      name: 'Skipped',
      value: pending,
      percentage: total ? Math.round((pending / total) * 1000) / 10 : 0,
      color: 'var(--color-primary)',
    },
  ];
};

/**
 * Formats logs feed.
 */
exports.getRecentActivityFeedPresenter = (logs) => {
  return logs.map((l, idx) => ({
    id: l._id || `log-${idx}`,
    text: l.action.replace(/_/g, ' '),
    meta: l.performer ? `by ${l.performer.name}` : 'by System',
    time: formatTimeAgo(l.timestamp),
    status:
      l.action.includes('FAIL') ||
      l.action.includes('ERROR') ||
      l.action.includes('DEGRADED')
        ? 'error'
        : l.action.includes('WARN')
          ? 'warning'
          : 'success',
  }));
};
