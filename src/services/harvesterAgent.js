const Task = require('../models/Task');
const aiService = require('./aiService');

/**
 * Harvester Agent: Automatically captures work signals from external sources.
 * Specialized for GitHub Commits and PRs.
 */

class HarvesterAgent {
  constructor() {
    this.name = 'Harvester';
  }

  /**
   * Process a GitHub event and create a task if necessary.
   * eventData { projectId, githubId, type, message, author, statusHint }
   */
  async processGithubActivity(eventData) {
    try {
      const { projectId, githubId, type, message, author, statusHint } = eventData;

      // 1. DEDUPLICATION: Check if this activity is already a task
      const existingTask = await Task.findOne({ githubId, project: projectId });
      if (existingTask) {
        return { 
          status: 'skipped', 
          reason: `Activity ${githubId} already processed as task ${existingTask._id}` 
        };
      }

      // 2. AI EXTRACTION: Extract meaningful task from commit/PR message
      // We append context to the AI for better classification
      const extractionText = `Source: GitHub ${type}\nAuthor: ${author}\nMessage: ${message}`;
      const suggestion = await aiService.extractTaskFromText(extractionText);

      // 3. TASK CREATION: Create the autonomous task
      const task = await Task.create({
        title: suggestion.title,
        description: suggestion.description || `Auto-generated from GitHub ${type}: ${message}`,
        project: projectId,
        status: statusHint || suggestion.status || 'todo',
        source: 'github',
        isAiGenerated: true,
        githubId: githubId,
        // We could attempt to map the GitHub author to a NexaSetu user here in the future
      });

      return {
        status: 'created',
        taskId: task._id,
        title: task.title,
        action: `Created task from GitHub ${type}`
      };
    } catch (error) {
      console.error('[HarvesterAgent] Error processing activity:', error);
      throw error;
    }
  }
}

module.exports = new HarvesterAgent();
