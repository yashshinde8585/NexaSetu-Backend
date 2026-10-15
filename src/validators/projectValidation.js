const { z } = require('zod');

// Schema for creating a new project
const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name is too long'),
  sprint: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  type: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
});

// Schema for updating an existing project
const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sprint: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  type: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['active', 'draft', 'archived']).optional(),
});

module.exports = {
  createProjectSchema,
  updateProjectSchema,
};
