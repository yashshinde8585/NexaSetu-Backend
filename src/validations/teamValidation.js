const { z } = require('zod');

// Schema for creating a new team
const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
  description: z.string().optional(),
  lead: z.string().min(24, 'Invalid lead ID format').optional(),
  members: z.array(z.string().min(24)).optional(),
  status: z.enum(['Active', 'On Hold', 'Archived']).optional(),
  sprintsPerMonth: z.number().min(1).max(10).optional(),
});

// Schema for updating an existing team
const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  lead: z.string().min(24).optional(),
  members: z.array(z.string().min(24)).optional(),
  status: z.enum(['Active', 'On Hold', 'Archived']).optional(),
  sprintsPerMonth: z.number().min(1).max(10).optional(),
});

module.exports = {
  createTeamSchema,
  updateTeamSchema,
};
