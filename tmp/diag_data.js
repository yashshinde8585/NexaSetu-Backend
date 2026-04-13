const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Task = require('../src/models/Task');
    const statuses = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    console.log('Task Statuses in DB:', JSON.stringify(statuses, null, 2));

    const totalTasks = await Task.countDocuments();
    console.log('Total Tasks:', totalTasks);

    const tasksWithProject = await Task.countDocuments({ project: { $exists: true } });
    console.log('Tasks with Project:', tasksWithProject);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
