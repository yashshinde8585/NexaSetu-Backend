const { z } = require('zod');

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// Schema for creating a new sprint
const createSprintSchema = z.object({
  name: z.string().min(1, 'Sprint name is required').max(100),
  goal: z.string().optional(),
  description: z.string().optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format',
  }),
  status: z.enum(['active', 'completed', 'upcoming', 'archived']).optional(),
  project: z
    .string()
    .regex(objectIdRegex, 'Invalid project ID format')
    .optional(),
  capacityPredicted: z.number().min(0).optional(),
  pointsTarget: z.number().min(0).optional(),
});

// Schema for updating an existing sprint
const updateSprintSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().optional(),
  description: z.string().optional(),
  startDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid start date format',
    }),
  endDate: z
    .string()
    .optional()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: 'Invalid end date format',
    }),
  status: z.enum(['active', 'completed', 'upcoming', 'archived']).optional(),
  capacityPredicted: z.number().min(0).optional(),
  pointsTarget: z.number().min(0).optional(),
});

const addTasksSchema = z.object({
  taskIds: z
    .array(z.string().regex(objectIdRegex, 'Invalid task ID format'))
    .min(1, 'At least one task ID is required'),
});

const completeSprintSchema = z
  .object({
    rolloverAction: z.enum(['backlog', 'sprint']).optional(),
    targetSprintId: z
      .string()
      .regex(objectIdRegex, 'Invalid target sprint ID format')
      .nullable()
      .optional(),
  })
  .refine(
    (data) => data.rolloverAction !== 'sprint' || Boolean(data.targetSprintId),
    {
      message: 'Target sprint ID is required when rolling over to a sprint',
      path: ['targetSprintId'],
    }
  );

module.exports = {
  createSprintSchema,
  updateSprintSchema,
  addTasksSchema,
  completeSprintSchema,
};
