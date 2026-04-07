const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('./src/utils/connectDB');
const Sprint = require('./src/models/Sprint');
const User = require('./src/models/User');

async function backfill() {
  await connectDB();

  const sprints = await Sprint.find();
  console.log(`Found ${sprints.length} sprints to re-scope.`);

  for (const sprint of sprints) {
    const creator = await User.findById(sprint.createdBy);
    if (creator && creator.workspaceId) {
      if (sprint.workspaceId?.toString() !== creator.workspaceId.toString()) {
        sprint.workspaceId = creator.workspaceId;
        await sprint.save();
        console.log(`Updated sprint ${sprint.name} to workspace ${creator.workspaceId}`);
      }
    } else {
      // Fallback to first available workspace in DB if creator is missing/invalid
      const firstUser = await User.findOne({ workspaceId: { $exists: true } });
      if (firstUser) {
        sprint.workspaceId = firstUser.workspaceId;
        await sprint.save();
        console.log(`Fallback: Updated sprint ${sprint.name} for orphan record.`);
      }
    }
  }

  console.log('Migration Complete.');
  process.exit();
}

backfill();
