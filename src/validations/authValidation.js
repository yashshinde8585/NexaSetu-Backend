const { z } = require('zod');

// Validates account initialization and workspace onboarding requirements
// Enforces strict pattern matching for administrative names to prevent injection or invalid characters
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').max(50),
  admin: z.string().trim().min(2, 'Administrator name is required').max(50).regex(/^[a-zA-Z\s.-]+$/, 'Admin name can only contain letters, spaces, dots, and hyphens'),
  email: z.string().email('Invalid email address format').trim().toLowerCase().max(255),
  password: z.string().min(8, 'Password must be at least 8 characters long for security').max(128),
  role: z.string().optional(),
  workspaceName: z.string().min(2).max(100).optional(),
  plan: z.string().optional(),
});

// Schema for user authentication
const loginSchema = z.object({
  email: z.string().email('Invalid email format').trim().toLowerCase().max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

module.exports = {
  registerSchema,
  loginSchema,
};
