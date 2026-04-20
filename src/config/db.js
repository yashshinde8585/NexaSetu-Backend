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

    await mongoose.connect(dbUri);
    logger.info(`Connected to MongoDB [${config.env}]`);
  } catch (error) {
    logger.error(`Database Connection Failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

