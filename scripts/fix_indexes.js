const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const fix = async () => {
    try {
        await mongoose.connect(process.env.DB_URI);
        const Task = mongoose.model('Task', new mongoose.Schema({})); // Small schema
        
        console.log('--- DROPPING BROKEN TASK INDEX ---');
        try {
            await Task.collection.dropIndex('githubId_1_project_1');
            console.log('[SUCCESS] Dropped index: githubId_1_project_1');
        } catch (err) {
            console.log('[SKIPPED] Index not found or already dropped.');
        }
        
        console.log('--- INDEX REPAIR COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error('Repair Script Failed:', err);
        process.exit(1);
    }
};

fix();
