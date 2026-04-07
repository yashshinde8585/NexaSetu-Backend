require('dotenv').config();

const connectDB = require('./src/utils/connectDB');
const Sprint = require('./src/models/Sprint');

async function check() {
  await connectDB();
  const total = await Sprint.countDocuments();
  const sample = await Sprint.findOne().lean();
  console.log('Total Sprints:', total);
  console.log('Sample Sprint:', JSON.stringify(sample, null, 2));
  process.exit();
}

check();
