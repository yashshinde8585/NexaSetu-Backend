const { z } = require('zod');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');

const schemas = {
  CREATE_PROJECT: z.object({
    projectName: z.string().min(3).max(100),
  }),
  CREATE_TASK: z.object({
    title: z.string().min(3).max(200),
    project: z.string().optional(),
    assignee: z.string().optional(),
  }),
  UPDATE_TASK_STATUS: z.object({
    taskTitle: z.string(),
    newStatus: z.enum(['todo', 'in_progress', 'in_review', 'done']),
  }),
  INVITE_USER: z.object({
    email: z.string().email(),
    name: z.string().optional(),
    role: z.enum(['ADMIN', 'MANAGER', 'DEV', 'INTERN']).optional(),
    project: z.string().optional(),
  }),
  REASSIGN_TASK: z.object({
    fromUser: z.string(),
    toUser: z.string(),
  }),
};

const validateTaskEnrichment = (data) => {
  const allowedFields = [
    'priority',
    'estimatedDuration',
    'subtasks',
    'tags',
    'description',
  ];
  const validatedData = {};

  if (!data || typeof data !== 'object') {
    throw new AppError('AI generated invalid response format', 500);
  }

  allowedFields.forEach((field) => {
    if (data[field] !== undefined) {
      if (
        field === 'priority' &&
        !['low', 'medium', 'high'].includes(data[field])
      )
        return;
      if (field === 'estimatedDuration' && typeof data[field] !== 'number')
        return;
      if (field === 'subtasks' && !Array.isArray(data[field])) return;

      validatedData[field] = data[field];
    }
  });

  return validatedData;
};

const validateIntentParams = (intent, params) => {
  const schema = schemas[intent];
  if (!schema) return params;

  try {
    return schema.parse(params);
  } catch (err) {
    logger.warn(
      `[AI-Validator] Intent ${intent} failed validation: ${err.message}`
    );
    return params;
  }
};

module.exports = {
  validateTaskEnrichment,
  validateIntentParams,
  schemas,
};
