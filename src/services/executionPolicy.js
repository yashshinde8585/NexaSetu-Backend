// Defines risk classifications for dynamic system tasks to determine autonomous vs manual execution paths.
const LOW_RISK = 'auto';
const HIGH_RISK = 'approval';

const getExecutionMode = (actionType, payload) => {
  switch (actionType) {
    case 'STATUS_CHANGE':
      // Classify state changes as low risk operations.
      return LOW_RISK;

    case 'UPDATE_TASK_DEADLINE':
      // Permit micro timeline shifts automatically while escalating major deviations.
      if (
        payload &&
        payload.daysShifted &&
        Math.abs(payload.daysShifted) <= 3
      ) {
        return LOW_RISK;
      }
      return HIGH_RISK;

    case 'REASSIGN_TASK':
      // Demand explicit authorization for all cross-personnel workload reassignments.
      return HIGH_RISK;

    case 'PROJECT_TIMELINE_SHIFT':
      // Classify macro project schedule adjustments as restricted high-risk actions.
      return HIGH_RISK;

    case 'GITHUB_SYNC':
      // Classify non-destructive telemetry synchronizations as safe operations.
      return LOW_RISK;

    default:
      // Enforce strict high-risk validation by default for unmapped actions.
      return HIGH_RISK;
  }
};

module.exports = {
  LOW_RISK,
  HIGH_RISK,
  getExecutionMode,
};
