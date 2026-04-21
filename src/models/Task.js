const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: [true, 'Tasks must be associated with a workspace.'],
      index: true,
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'in_review', 'done'],
      default: 'todo',
      index: true,
    },
    assignedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    sprint: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sprint',
      index: true,
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
      index: true,
    },
    dueDate: {
      type: Date,
      required: false,
      index: true,
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
        index: true, // Multikey index for dependency chains
      },
    ],
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ['intent', 'epic', 'story', 'task', 'bug'],
      default: 'task',
      index: true,
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
      index: true,
    },
    embedding: {
      type: [Number],
      select: false,
    },
    taskNumber: {
      type: Number,
      required: false,
      index: true,
    },
    githubUrl: {
      type: String,
      sparse: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
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
      index: true,
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
    blocked: {
      type: Boolean,
      default: false,
      index: true,
    },
    blockedReason: {
      type: String,
    },
    blockedAt: {
      type: Date,
    },
    steps: [
      {
        text: String,
        completed: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Optimized indexes for Efficient Search & Retrieval (ESR) patterns
taskSchema.index({ workspaceId: 1, project: 1, status: 1, type: 1 });
taskSchema.index({ workspaceId: 1, assignedUser: 1, status: 1 });
taskSchema.index({ workspaceId: 1, status: 1, dueDate: 1 }); // For overdue tracking
taskSchema.index({ workspaceId: 1, type: 1, status: 1 });
taskSchema.index({ project: 1, taskNumber: 1 }, { unique: true }); // Fast lookup by project task number

// Distributed auto-increment for project-specific task numbering.
// Utilizes Redis for atomic speed with MongoDB as a durable secondary store.
taskSchema.pre('save', async function () {
  if (this.isNew) {
    const { getRedisClient, isRedisConnected } = require('../config/redis');
    const redis = getRedisClient();
    const projectKey = `project:${this.project}:lastTaskNumber`;

    try {
      if (isRedisConnected()) {
        const nextNumber = await redis.incr(projectKey);
        this.taskNumber = nextNumber;
        
        // Persist the sequence to MongoDB in the background to ensure eventual durability
        const Project = mongoose.model('Project');
        Project.updateOne({ _id: this.project }, { lastTaskNumber: nextNumber }).catch(() => {});
      } else {
        // Fallback to legacy atomic increment if Redis is offline
        const Project = mongoose.model('Project');
        const project = await Project.findByIdAndUpdate(
          this.project,
          { $inc: { lastTaskNumber: 1 } },
          { returnDocument: 'after', useFindAndModify: false, lean: true }
        );
        if (project) {
          this.taskNumber = project.lastTaskNumber;
        }
      }
    } catch (err) {
      console.warn('[TASK-NUMBER] Sequence generation failed, using timestamp fallback');
      this.taskNumber = Date.now();
    }
  }
});

module.exports = mongoose.model('Task', taskSchema);
