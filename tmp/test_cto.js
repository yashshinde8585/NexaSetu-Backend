const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

const ctoService = require('../src/services/ctoService');

async function test() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    console.log('Testing Global Stats...');
    const global = await ctoService.getGlobalControlStats();
    console.log('Global Stats OK');

    console.log('Testing Functional Breakdown...');
    const functional = await ctoService.getFunctionalBreakdown();
    console.log('Functional OK');

    console.log('Testing Pipeline View...');
    const pipeline = await ctoService.getPipelineView();
    console.log('Pipeline OK');

    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  }
}

test();
