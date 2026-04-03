// Defines risk classifications for dynamic system tasks to determine autonomous vs manual execution paths.
class ExecutionPolicy {
  constructor() {
    this.LOW_RISK = 'auto';
    this.HIGH_RISK = 'approval';
  }

  getExecutionMode(actionType, payload) {
    switch (actionType) {
      case 'STATUS_CHANGE':
        // Classify state changes as low risk operations.
        return this.LOW_RISK;

      case 'UPDATE_TASK_DEADLINE':
        // Permit micro timeline shifts automatically while escalating major deviations.
        if (
          payload &&
          payload.daysShifted &&
          Math.abs(payload.daysShifted) <= 3
        ) {
          return this.LOW_RISK;
        }
        return this.HIGH_RISK;

      case 'REASSIGN_TASK':
        // Demand explicit authorization for all cross-personnel workload reassignments.
        return this.HIGH_RISK;

      case 'PROJECT_TIMELINE_SHIFT':
        // Classify macro project schedule adjustments as restricted high-risk actions.
        return this.HIGH_RISK;

      case 'GITHUB_SYNC':
        // Classify non-destructive telemetry synchronizations as safe operations.
        return this.LOW_RISK;

      default:
        // Enforce strict high-risk validation by default for unmapped actions.
        return this.HIGH_RISK;
    }
  }

  isSensitive(actionType) {
    const highRiskActions = [
      'REASSIGN_TASK',
      'PROJECT_TIMELINE_SHIFT',
      'DELETE_TASK',
    ];
    return highRiskActions.includes(actionType);
  }
}

module.exports = new ExecutionPolicy();
