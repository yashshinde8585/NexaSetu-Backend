const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  isProduction ? 'DB_ATLAS_URI' : 'DB_LOCAL_URI',
  isProduction ? 'REDIS_INTERNAL_URL' : 'REDIS_LOCAL_URL',
  'GROQ_API_KEY',
  'ENCRYPTION_KEY',
];

const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.error(
    '\x1b[31m[CRITICAL] Configuration Error: Missing Environment Variables\x1b[0m'
  );
  console.error(
    '\x1b[31m---------------------------------------------------------\x1b[0m'
  );
  missingVars.forEach((v) => console.error(`  \x1b[33m- ${v}\x1b[0m`));
  console.error(
    '\x1b[31m---------------------------------------------------------\x1b[0m'
  );
  console.error(
    '\x1b[31mApplication startup aborted. Please check your .env file.\x1b[0m'
  );
  process.exit(1);
}

if (
  process.env.ENCRYPTION_KEY &&
  Buffer.from(process.env.ENCRYPTION_KEY).length !== 32
) {
  console.error(
    '\x1b[31m[CRITICAL] Configuration Error: Invalid ENCRYPTION_KEY length\x1b[0m'
  );
  console.error(
    '\x1b[31m---------------------------------------------------------\x1b[0m'
  );
  console.error(
    `  \x1b[33m- ENCRYPTION_KEY must be exactly 32 bytes (got ${Buffer.from(process.env.ENCRYPTION_KEY).length} bytes)\x1b[0m`
  );
  console.error(
    '\x1b[31m---------------------------------------------------------\x1b[0m'
  );
  console.error(
    '\x1b[31mApplication startup aborted. Please check your .env file.\x1b[0m'
  );
  process.exit(1);
}

const config = {
  env,
  isProduction,
  isDevelopment: env === 'development',
  isTest: env === 'test',
  port: parseInt(process.env.PORT, 10) || 5000,

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_ACCESS_EXPIRATION || '8h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION || '30d',
    cookieOptions: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    },
  },

  db: {
    uri: isProduction ? process.env.DB_ATLAS_URI : process.env.DB_LOCAL_URI,
    options: {},
  },

  redis: {
    url: isProduction
      ? process.env.REDIS_INTERNAL_URL
      : process.env.REDIS_LOCAL_URL,
  },

  ai: {
    hfKey: process.env.HUGGINGFACE_API_KEY,
    groqKey: process.env.GROQ_API_KEY,
  },

  logging: {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  },

  security: {
    encryptionKey: process.env.ENCRYPTION_KEY?.trim(),
    failedLoginLimit: parseInt(process.env.FAILED_LOGIN_LIMIT, 10) || 5,
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION_MINS, 10) || 30,
    sessionLimit: parseInt(process.env.SESSION_LIMIT, 10) || 5,
    sessionDurationMs: 30 * 24 * 60 * 60 * 1000,
  },
};

module.exports = config;
