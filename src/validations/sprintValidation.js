const { z } = require('zod');

// Schema for creating a new sprint
const createSprintSchema = z.object({
  name: z.string().min(1, 'Sprint name is required').max(100),
  goal: z.string().optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid end date format',
  }),
  status: z.enum(['active', 'completed', 'upcoming', 'archived']).optional(),
  project: z.string().min(24, 'Invalid project ID format').optional(),
  capacityPredicted: z.number().min(0).optional(),
  pointsTarget: z.number().min(0).optional(),
});

// Schema for updating an existing sprint
const updateSprintSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  goal: z.string().optional(),
  startDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid start date format',
  }),
  endDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid end date format',
  }),
  status: z.enum(['active', 'completed', 'upcoming', 'archived']).optional(),
  capacityPredicted: z.number().min(0).optional(),
  pointsTarget: z.number().min(0).optional(),
});

module.exports = {
  createSprintSchema,
  updateSprintSchema,
};
