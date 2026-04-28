const Task = require('../models/Task');
const aiService = require('./aiService');
const aiOutputValidator = require('../validators/aiOutputValidator');
const logger = require('../utils/logger');

// Autonomous daemon responsible for extracting operational parameters from external CI systems.
class HarvesterAgent {
  constructor() {
    this.name = 'Harvester';
  }

  async processGithubActivity(eventData) {
    try {
      const { projectId, githubId, type, message, author, statusHint } =
        eventData;

      const Project = require('../models/Project');
      const projectDoc = await Project.findById(projectId);
      if (!projectDoc) {
        return { status: 'failed', reason: 'Project not found' };
      }

      const existingTask = await Task.findOne({ githubId, project: projectId });
      if (existingTask) {
        return {
          status: 'skipped',
          reason: `Activity ${githubId} already processed as task ${existingTask._id}`,
        };
      }

      const extractionText = `Source: GitHub ${type}\nAuthor: ${author}\nMessage: ${message}`;
      const suggestion = await aiService.extractTaskFromText(extractionText);

      // Validate AI output before persistence to ensure system integrity.
      const validatedData = aiOutputValidator.validateTaskEnrichment(suggestion);

      const task = await Task.create({
        title: validatedData.title || suggestion.title,
        description:
          validatedData.description ||
          suggestion.description ||
          `Auto-generated from GitHub ${type}: ${message}`,
        project: projectId,
        workspaceId: projectDoc.workspaceId,
        status: statusHint || validatedData.status || suggestion.status || 'todo',
        source: 'github',
        isAiGenerated: true,
        githubId: githubId,
        priority: validatedData.priority || 'medium',
        estimatedDuration: validatedData.estimatedDuration || 30
      });

      return {
        status: 'created',
        taskId: task._id,
        title: task.title,
        action: `Created task from GitHub ${type}`,
      };
    } catch (error) {
      logger.error('[HarvesterAgent] Error processing activity:', error);
      throw error;
    }
  }
}

module.exports = new HarvesterAgent();
