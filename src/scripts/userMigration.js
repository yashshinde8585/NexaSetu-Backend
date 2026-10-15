/**
 * User Department Normalization Migration Script
 * Classifies all existing users based on their job title and assigns them to the correct department.
 */

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const logger = require('../utils/logger');

const runMigration = async () => {
  try {
    logger.info(
      '[MIGRATION] Starting User department classification migration...'
    );

    // Connect to database
    await connectDB();

    // Find all users without a department field set
    const users = await User.find({
      $or: [{ department: { $exists: false } }, { department: null }],
    }).setOptions({ bypassTenantSafety: true }); // Enable tenant safety bypass since this is a system script

    logger.info(`[MIGRATION] Found ${users.length} users to migrate.`);

    let migratedCount = 0;

    for (const user of users) {
      // Triggering save will run the userSchema.pre('save') hook we just wrote
      // which auto-classifies the user based on jobTitle/role
      user.department = undefined; // Force pre-save hook evaluation
      await user.save();
      migratedCount++;
    }

    logger.info(`[MIGRATION] Successfully migrated ${migratedCount} users.`);
    mongoose.connection.close();
    logger.info('[MIGRATION] Connection closed. Migration complete.');
    process.exit(0);
  } catch (err) {
    logger.error(`[MIGRATION] Critical migration failure: ${err.message}`);
    process.exit(1);
  }
};

runMigration();
