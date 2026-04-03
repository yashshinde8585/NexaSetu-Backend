const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'in_review', 'done'],
      default: 'todo',
    },
    assignedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    sprint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
    },
    source: {
      type: String,
      enum: ['manual', 'ai-generated', 'github'],
      default: 'manual',
    },
    isAiGenerated: {
      type: Boolean,
      default: false,
    },
    githubId: {
      type: String,
      sparse: true,
    },
    dueDate: {
      type: Date,
      required: false,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    actualDuration: {
      type: Number, // in minutes
    },
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    taskNumber: {
      type: Number,
      required: false, // Will be auto-populated
    },
    githubUrl: {
      type: String,
      sparse: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    timelineHistory: [
      {
        oldDueDate: Date,
        newDueDate: Date,
        reason: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Auto-increment taskNumber per project
taskSchema.pre('save', async function () {
  if (this.isNew) {
    const Project = mongoose.model('Project');
    const project = await Project.findByIdAndUpdate(
      this.project,
      { $inc: { lastTaskNumber: 1 } },
      { returnDocument: 'after', useFindAndModify: false }
    );
    this.taskNumber = project.lastTaskNumber;
  }
});

// Compound unique index for GitHub harvested tasks ONLY (allows multiple manual tasks with null githubId)
taskSchema.index(
  { githubId: 1, project: 1 },
  {
    unique: true,
    partialFilterExpression: { githubId: { $type: 'string' } },
  }
);

// Performance Optimization: Compound index for dashboard aggregation ($facet)
taskSchema.index({ project: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('Task', taskSchema);
