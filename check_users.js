require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('./src/utils/connectDB');

async function checkUsers() {
  await connectDB();
  const User = mongoose.model('User', new mongoose.Schema({
    workspaceId: mongoose.Schema.Types.ObjectId,
    name: String,
  }));
  const users = await User.find().lean();
  console.log('Users and their Workspaces:');
  users.forEach((u) => console.log(`${u.name || 'N/A'}: ${u.workspaceId}`));
  process.exit();
}

checkUsers();
