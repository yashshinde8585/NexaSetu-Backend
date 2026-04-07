const mongoose = require('mongoose');

/**
 * Connects to the MongoDB database using environment variables.
 * Shared utility for one-off CLI scripts to avoid duplicating the
 * connection boilerplate across backfill/check scripts.
 */
const connectDB = async () => {
  const uri = process.env.DB_LOCAL_URI || process.env.DB_ATLAS_URI;
  if (!uri) throw new Error('No DB URI found in environment variables.');
  await mongoose.connect(uri);
  console.log('Connected to:', uri);
};

module.exports = connectDB;
