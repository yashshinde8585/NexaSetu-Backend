const { z } = require('zod');

// Schema for creating a new task
const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(200, 'Title is too long'),
  description: z.string().optional(),
  project: z.string().min(24, 'Invalid project ID format'),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
  assignedUser: z.string().optional(),
  sprint: z.string().optional(),
  dueDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  type: z.enum(['intent', 'epic', 'story', 'task', 'bug']).optional(),
  estimatedDuration: z.number().min(0).optional(),
});

// Schema for updating an existing task
const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
  assignedUser: z.string().optional(),
  sprint: z.string().optional(),
  dueDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  estimatedDuration: z.number().min(0).optional(),
  blocked: z.boolean().optional(),
  blockedReason: z.string().optional(),
});

module.exports = {
  createTaskSchema,
  updateTaskSchema,
};
