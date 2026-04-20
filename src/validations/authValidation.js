const { z } = require('zod');

// Schema for user registration and workspace onboarding
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').max(50),
  admin: z.string().min(2, 'Administrator name is required').max(50),
  email: z.string().email('Invalid email address format').trim().toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters long for security'),
  role: z.string().optional(),
  workspaceName: z.string().min(2).max(100).optional(),
  plan: z.string().optional(),
});

// Schema for user authentication
const loginSchema = z.object({
  email: z.string().email('Invalid email format').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

module.exports = {
  registerSchema,
  loginSchema,
};
