const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  const uri = process.env.DB_LOCAL_URI || process.env.DB_ATLAS_URI;
  if (!uri) throw new Error('No DB URI found in environment variables.');
  await mongoose.connect(uri);
  logger.info('Connected to: %s', uri);
};

module.exports = connectDB;
