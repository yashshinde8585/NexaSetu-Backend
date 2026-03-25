const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');

const debug = async () => {
    try {
        if (!process.env.DB_URI) {
            console.error('DB_URI not found in .env');
            process.exit(1);
        }
        await mongoose.connect(process.env.DB_URI);
        const users = await User.find({}, 'name email role _id workspaceId');
        console.log('--- SYSTEM USERS ---');
        users.forEach(u => {
            console.log(`ID: ${u._id} | NAME: ${u.name} | EMAIL: ${u.email} | ROLE: ${u.role} | WORKSPACE: ${u.workspaceId || 'NONE'}`);
        });
        process.exit(0);
    } catch (err) {
        console.error('Debug Script Failed:', err);
        process.exit(1);
    }
};

debug();
