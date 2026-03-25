const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const clear = async () => {
    try {
        if (!process.env.DB_URI) {
            console.error('DB_URI not found');
            process.exit(1);
        }
        await mongoose.connect(process.env.DB_URI);
        
        console.log('--- CLEARING DATABASE ---');
        
        const collections = ['users', 'projects', 'tasks', 'workspaces', 'invitations'];
        
        for (const col of collections) {
            try {
                await mongoose.connection.dropCollection(col);
                console.log(`[CLEARED] - ${col}`);
            } catch (err) {
                // If the collection doesn't exist, just ignore.
                console.log(`[SKIPPED] - ${col} (Might not exist)`);
            }
        }
        
        console.log('--- DATABASE RESET SUCCESSFUL ---');
        process.exit(0);
    } catch (err) {
        console.error('Reset Script Failed:', err);
        process.exit(1);
    }
};

clear();
