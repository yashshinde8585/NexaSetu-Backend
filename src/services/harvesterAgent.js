const Task = require('../models/Task');
const aiService = require('./aiService');

// Autonomous daemon responsible for extracting operational parameters from linked external CI systems.
class HarvesterAgent {
  constructor() {
    this.name = 'Harvester';
  }

  async processGithubActivity(eventData) {
    try {
      const { projectId, githubId, type, message, author, statusHint } =
        eventData;

      // Check distinct telemetry signatures preventing duplicate system data ingestion.
      const existingTask = await Task.findOne({ githubId, project: projectId });
      if (existingTask) {
        return {
          status: 'skipped',
          reason: `Activity ${githubId} already processed as task ${existingTask._id}`,
        };
      }

      // Augment raw git payloads dynamically to improve natural language structural breakdown.
      const extractionText = `Source: GitHub ${type}\nAuthor: ${author}\nMessage: ${message}`;
      const suggestion = await aiService.extractTaskFromText(extractionText);

      // Commit AI-verified system entities definitively into active datastores.
      const task = await Task.create({
        title: suggestion.title,
        description:
          suggestion.description ||
          `Auto-generated from GitHub ${type}: ${message}`,
        project: projectId,
        status: statusHint || suggestion.status || 'todo',
        source: 'github',
        isAiGenerated: true,
        githubId: githubId,
        // Retain author traceability mappings for future advanced linkage routines.
      });

      return {
        status: 'created',
        taskId: task._id,
        title: task.title,
        action: `Created task from GitHub ${type}`,
      };
    } catch (error) {
      console.error('[HarvesterAgent] Error processing activity:', error);
      throw error;
    }
  }
}

module.exports = new HarvesterAgent();
