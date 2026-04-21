const AppError = require('../utils/appError');

/**
 * Enforces logical prerequisites for multi-stage operations.
 * Prevents execution of actions that lack the necessary business context (e.g., active workspace).
 */
const validateWorkflow = (requiredPrerequisites = []) => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return next(new AppError('Authentication required to verify workflow context', 401));
    }

    // Check for Workspace Prerequisite
    if (requiredPrerequisites.includes('workspace') && !user.workspaceId) {
      return next(new AppError('Logical Error: No active workspace found. Please complete onboarding first.', 403));
    }

    // Check for Project Prerequisite (e.g., for task creation)
    if (requiredPrerequisites.includes('project') && (!req.body.project && !req.params.projectId)) {
      return next(new AppError('Logical Error: Project context is missing for this operation.', 400));
    }

    // Check for "Ready" status (e.g., for starting a sprint)
    if (requiredPrerequisites.includes('active_workspace')) {
      // Assuming we might have a status field in the future
      // if (user.workspaceStatus !== 'ready') ...
    }

    next();
  };
};

module.exports = { validateWorkflow };
