// Validates environment variables and exports centralized configuration settings for the backend application.
const dotenv = require('dotenv');
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const REQUIRED_VARS = [
  'JWT_SECRET',
  isProduction ? 'DB_ATLAS_URI' : 'DB_LOCAL_URI',
  'GROQ_API_KEY',
];

const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

if (missing.length > 0) {
  console.error(
    '\x1b[31m[CRITICAL CONFIG ERROR]: The following environment variables are missing:\x1b[0m'
  );
  missing.forEach((v) => console.error(`  - ${v}`));
  console.error('\x1b[31mx--- ABORTING STARTUP ---x\x1b[0m');
  process.exit(1);
}

module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: '7d',
  },
  db: {
    uri: isProduction ? process.env.DB_ATLAS_URI : process.env.DB_LOCAL_URI,
  },
  ai: {
    hfKey: process.env.HUGGINGFACE_API_KEY,
    groqKey: process.env.GROQ_API_KEY,
  },
  app: {
    port: process.env.PORT || 5000,
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};
