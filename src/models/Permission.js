const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, unique: true }, // e.g., 'create:task'
    description: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Permission', permissionSchema);
