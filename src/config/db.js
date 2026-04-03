// Establishes a connection to the MongoDB database based on the active environment configuration.
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const DB_URI = isProduction
      ? process.env.DB_ATLAS_URI
      : process.env.DB_LOCAL_URI || 'mongodb://localhost:27017/nexasetu';

    if (!DB_URI) {
      throw new Error(
        `Database URI not defined for ${isProduction ? 'production' : 'development'} environment.`
      );
    }

    await mongoose.connect(DB_URI);
    console.log(
      `Connected to MongoDB (${isProduction ? 'Production/Atlas' : 'Local'})`
    );
  } catch (error) {
    console.error('Connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
