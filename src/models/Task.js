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
      type: Number,
    },
    dependencies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
      },
    ],
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
    },
    type: {
      type: String,
      enum: ['intent', 'epic', 'story', 'task'],
      default: 'task',
    },
    strategicWeight: {
      v: { type: Number, default: 0 },
      u: { type: Number, default: 0 },
      rm: { type: Number, default: 0 },
      sf: { type: Number, default: 0 },
    },
    sasScore: {
      type: Number,
      default: 0,
    },
    embedding: {
      type: [Number],
      select: false,
    },
    taskNumber: {
      type: Number,
      required: false,
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
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    estimatedDuration: {
      type: Number,
      default: 30,
    },
    remainingDuration: {
      type: Number,
    },
    lastStartedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-increment task number per project
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

// Unique index for GitHub tasks
taskSchema.index(
  { githubId: 1, project: 1 },
  {
    unique: true,
    partialFilterExpression: { githubId: { $type: 'string' } },
  }
);

// Dashboard aggregation optimization
taskSchema.index({ project: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model('Task', taskSchema);
