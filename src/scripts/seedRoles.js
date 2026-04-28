require('dotenv').config({ path: __dirname + '/../../.env' });
const mongoose = require('mongoose');
const Role = require('../models/Role');
const Permission = require('../models/Permission');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const uri = process.env.DB_LOCAL_URI || process.env.DB_ATLAS_URI;
    await mongoose.connect(uri);
    logger.info('MongoDB connected successfully.');
  } catch (error) {
    logger.error('MongoDB connection error: %o', error);
    process.exit(1);
  }
};

const permissionsDef = [
  // RBAC Config
  { action: 'manage:rbac', description: 'Full access to create/update Roles and Permissions' },
  { action: 'manage:teams', description: 'Can create and map teams' },
  
  // Execution
  { action: 'create:sprint', description: 'Can create and configure sprints' },
  { action: 'update:sprint', description: 'Can update sprint status' },
  { action: 'create:task', description: 'Can create new tasks' },
  { action: 'update:task', description: 'Can update task status' },
  { action: 'assign:task', description: 'Can assign tasks to team members' },
  
  // Observability
  { action: 'view:metrics', description: 'Can view team metrics and velocity' },
  { action: 'view:reports', description: 'Can view executive level reports' },
  { action: 'view:health', description: 'Can view system health status' },
];

const rolesDef = {
  'Workspace Admin': ['manage:rbac', 'manage:teams', 'view:health'],
  
  // Strategic Command
  'CTO': ['view:metrics', 'view:reports', 'view:health'],
  'VP Engineering': ['view:metrics', 'view:reports', 'view:health', 'manage:teams'],
  
  // Management Layer
  'Engineering Manager': ['create:sprint', 'update:sprint', 'view:metrics', 'view:reports', 'manage:teams', 'create:task', 'update:task', 'assign:task'],
  'People Ops': ['manage:teams', 'view:reports'],
  
  // Technical Leadership
  'Tech Lead': ['create:sprint', 'update:sprint', 'create:task', 'update:task', 'assign:task', 'view:metrics'],
  'QA Lead': ['create:task', 'update:task', 'assign:task', 'view:metrics'],
  
  // Engineering Execution
  'Senior Engineer': ['create:task', 'update:task', 'assign:task'],
  'Software Engineer': ['create:task', 'update:task'],
  'Junior Engineer': ['update:task'],
  'Intern': ['update:task']
};

const seed = async () => {
  await connectDB();

  logger.info('Clearing old roles and permissions...');
  await Role.deleteMany({});
  await Permission.deleteMany({});

  logger.info('Seeding Permissions...');
  const permissionDocs = {};
  for (const p of permissionsDef) {
    const perm = await Permission.create(p);
    permissionDocs[perm.action] = perm._id;
  }

  logger.info('Seeding Roles...');
  for (const [roleName, actions] of Object.entries(rolesDef)) {
    const permissionIds = actions.map(a => permissionDocs[a]);
    await Role.create({
      name: roleName,
      description: `Auto-seeded role for ${roleName}`,
      permissions: permissionIds
    });
    logger.info(`Created Role: ${roleName} with ${actions.length} permissions.`);
  }

  logger.info('✅ Seeding completed successfully!');
  process.exit(0);
};

seed();
