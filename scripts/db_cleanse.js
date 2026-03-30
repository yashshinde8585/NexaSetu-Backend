const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../src/models/User');
const Project = require('../src/models/Project');
const Task = require('../src/models/Task');
const Workspace = require('../src/models/Workspace');

dotenv.config();


const cleanse = async () => {
    try {
        console.log('--- NexaSetu Database Cleanse Protocol ---');
        await mongoose.connect(process.env.DB_URI);
        console.log('Connected to MongoDB.');

        // 1. Clear Tasks
        const taskRes = await Task.deleteMany({});
        console.log(`Cleaned: ${taskRes.deletedCount} Tasks removed.`);

        // 2. Clear Projects
        const projRes = await Project.deleteMany({});
        console.log(`Cleaned: ${projRes.deletedCount} Projects removed.`);

        // 3. Clear ALL Users
        const userRes = await User.deleteMany({});
        console.log(`Cleaned: ${userRes.deletedCount} Total users removed.`);

        // 4. Clear ALL Workspaces
        const wsRes = await Workspace.deleteMany({});
        console.log(`Cleaned: ${wsRes.deletedCount} Workspaces removed.`);

        // 5. Reset Workspace Stats (Optional but clean)
        // We'll keep the actual workspace document since it's yours.

        console.log('--- Cleanse Complete ---');
        console.log('Your dashboard is now at absolute zero. Log in to start fresh.');
        process.exit(0);

    } catch (error) {
        console.error('Cleanse failed:', error);
        process.exit(1);
    }
};

cleanse();
