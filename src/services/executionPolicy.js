/**
 * Execution Policy System: Centralized logic for determining action risk levels.
 * Defines whether an action can be performed autonomously or requires user approval.
 */

class ExecutionPolicy {
  constructor() {
    this.LOW_RISK = 'auto';
    this.HIGH_RISK = 'approval';
  }

  /**
   * Determines the execution mode for a given action.
   * @param {string} actionType - The type of action (e.g., 'REASSIGN_TASK')
   * @param {Object} payload - The data associated with the action
   * @returns {string} - 'auto' or 'approval'
   */
  getExecutionMode(actionType, payload) {
    switch (actionType) {
      case 'STATUS_CHANGE':
        // Changing status (e.g., to 'in_progress' or 'done') is generally low risk
        return this.LOW_RISK;

      case 'UPDATE_TASK_DEADLINE':
        // Auto-approve if the deadline shift is small (e.g., < 3 days)
        if (payload && payload.daysShifted && Math.abs(payload.daysShifted) <= 3) {
          return this.LOW_RISK;
        }
        return this.HIGH_RISK;

      case 'REASSIGN_TASK':
        // Moving work between people is high-impact and requires human oversight
        return this.HIGH_RISK;

      case 'PROJECT_TIMELINE_SHIFT':
        // Shifting an entire project schedule is high risk
        return this.HIGH_RISK;

      case 'GITHUB_SYNC':
        // Syncing data is low risk as it doesn't delete user work
        return this.LOW_RISK;

      default:
        // Default to high risk for safety
        return this.HIGH_RISK;
    }
  }

  /**
   * Checks if an action is considered "Sensitive"
   */
  isSensitive(actionType) {
      const highRiskActions = ['REASSIGN_TASK', 'PROJECT_TIMELINE_SHIFT', 'DELETE_TASK'];
      return highRiskActions.includes(actionType);
  }
}

module.exports = new ExecutionPolicy();
