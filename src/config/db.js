const mongoose = require('mongoose');
const config = require('./config');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const dbUri = config.db.uri;

    if (!dbUri) {
      throw new Error(
        `Database URI not defined for ${config.env} environment.`
      );
    }

    await mongoose.connect(dbUri, {
      maxPoolSize: 100, // Balanced for high-concurrency without overwhelming DB resources
      minPoolSize: 10, // Keeps a warm pool for immediate request processing
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000, // Fail fast to prevent request hang during outages
      heartbeatFrequencyMS: 10000,
    });
    logger.info(`Connected to MongoDB [${config.env}] (Pool: 100)`);
  } catch (error) {
    logger.error(`Database Connection Failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
