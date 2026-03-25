const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const DB_URI = process.env.DB_URI || 'mongodb://localhost:27017/nexasetu';
    await mongoose.connect(DB_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
