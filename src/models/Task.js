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
      enum: ['intent', 'epic', 'story', 'task', 'bug'],
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
    blocked: {
      type: Boolean,
      default: false,
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

// Dashboard aggregation optimization with workspace isolation
taskSchema.index({ workspaceId: 1, project: 1, status: 1, type: 1, dueDate: 1 });
taskSchema.index({ workspaceId: 1, assignedUser: 1, status: 1, type: 1 });
taskSchema.index({ project: 1, status: 1 }); // Frequent filter for project views

// Auto-increment task number per project (Distributed & Parallel ready)
taskSchema.pre('save', async function () {
  if (this.isNew) {
    const { getRedisClient } = require('../config/redis');
    const redis = getRedisClient();
    const projectKey = `project:${this.project}:lastTaskNumber`;

    try {
      if (redis && redis.status === 'ready') {
        const nextNumber = await redis.incr(projectKey);
        this.taskNumber = nextNumber;
        
        // Sync back to MongoDB periodically or in the background for durability
        // For now, we update it in the background
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
