class WorkflowEngine {
  async onTaskCreated(task) {
    // TL workflow rules
    if (!task.assignee && task.teamId) {
      // Auto-assign based on workload (mock logic)
      console.log(`[Workflow] Task ${task._id} auto-assignment triggered.`);
    }
  }

  async onTaskStatusChanged(task, oldStatus, newStatus) {
    console.log(`[Workflow] Task ${task._id} moved from ${oldStatus} to ${newStatus}`);
    
    // E.g. notify QA if status is IN_REVIEW
    if (newStatus === 'IN_REVIEW') {
      console.log(`[Workflow] Triggering QA assignment for task ${task._id}`);
    }
  }
}

module.exports = new WorkflowEngine();
