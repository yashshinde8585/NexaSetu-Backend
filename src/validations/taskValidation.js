const { z } = require('zod');

// Enforces data integrity for new task creation across the ecosystem
const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(200, 'Title is too long'),
  description: z.string().max(5000, 'Description is too long').optional(),
  project: z.string().min(24, 'Invalid project ID format'),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
  assignedUser: z.string().optional(),
  sprint: z.string().optional(),
  dueDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  startDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  durationUnit: z.enum(['minutes', 'hours', 'days']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  type: z.enum(['intent', 'epic', 'story', 'task', 'bug', 'spike', 'tech_debt']).optional(),
  estimatedDuration: z.number().min(0).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().optional(),
    storagePath: z.string(),
    size: z.number(),
    type: z.string()
  })).optional(),
}).strict();

// Schema for updating an existing task
const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000, 'Description is too long').optional(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
  assignedUser: z.string().optional(),
  sprint: z.string().optional(),
  dueDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  startDate: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  durationUnit: z.enum(['minutes', 'hours', 'days']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  type: z.enum(['intent', 'epic', 'story', 'task', 'bug', 'spike', 'tech_debt']).optional(),
  estimatedDuration: z.number().min(0).optional(),
  blocked: z.boolean().optional(),
  blockedReason: z.string().max(1000, 'Reason is too long').optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().optional(),
    storagePath: z.string(),
    size: z.number(),
    type: z.string()
  })).optional(),
  version: z.number().optional(), // Required for Optimistic Concurrency Control
  __v: z.number().optional(),     // Mongoose internal version for state synchronization
}).strict();

module.exports = {
  createTaskSchema,
  updateTaskSchema,
};
