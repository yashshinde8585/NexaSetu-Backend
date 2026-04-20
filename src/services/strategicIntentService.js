const Task = require('../models/Task');
const aiService = require('./aiService');
const aiHelpers = require('../utils/aiHelpers');
const AppError = require('../utils/appError');

/**
 * Service to handle Strategic Intent logic, SAS scoring, and AI story generation.
 */
class StrategicIntentService {
  /**
   * Calculates the Strategic Alignment Score (SAS) for a given item.
   * SAS = (W1*V + W2*U + W3*RM + W4*SF) / sqrt(Effort)
   */
  calculateSAS(weight, storyPoints = 1) {
    const { v = 0, u = 0, rm = 0, sf = 0 } = weight || {};
    const effort = Math.max(storyPoints, 1);
    
    // Weights (could be configurable)
    const weights = { v: 0.4, u: 0.2, rm: 0.2, sf: 0.2 };
    
    const baseScore = (weights.v * v + weights.u * u + weights.rm * rm + weights.sf * sf);
    const score = baseScore / Math.sqrt(effort);
    
    return parseFloat(score.toFixed(2));
  }

  /**
   * Generates User Stories from a high-level strategic goal (Intent).
   */
  async generateStoriesFromIntent(intentId, userId) {
    const intent = await Task.findById(intentId);
    if (!intent) throw new Error('Intent not found');

    const prompt = `
      You are a Product Engineer. Break down this strategic goal into 3-5 high-quality User Stories.
      Goal Title: "${intent.title}"
      Goal Description: "${intent.description || 'No description provided'}"
      
      Return the result ONLY as a JSON array of objects with:
      - title: (short story title)
      - description: (formatted as "As a <role>, I want <action>, so that <value>")
      - strategicWeight: { "v": (0-100), "u": (0-100), "rm": (0-100), "sf": (0-100) }
      - storyPoints: (estimated difficulty 1, 3, 5, 8, 13)
    `.trim();

    const response = await aiService.processPrompt(prompt);
    const storiesData = aiHelpers.extractAndParseJSON(response);

    if (!Array.isArray(storiesData)) {
      throw new Error('AI failed to generate a structured list of stories.');
    }

    const createdStories = [];
    for (const data of storiesData) {
      const sasScore = this.calculateSAS(data.strategicWeight, data.storyPoints);
      
      const story = await Task.create({
        title: data.title,
        description: data.description,
        project: intent.project,
        parentId: intent._id,
        type: 'story',
        strategicWeight: data.strategicWeight,
        storyPoints: data.storyPoints,
        sasScore: sasScore,
        createdBy: userId,
        status: 'todo'
      });
      createdStories.push(story);
    }

    return createdStories;
  }

  /**
   * Finds potential duplicate items using semantic similarity (Mocked for now).
   */
  async findPotentialDuplicates(projectId, text) {
    // In a real implementation, we'd use vector distance (e.g., MongoDB Atlas Vector Search or Supabase)
    // For now, we fetch items from the same project and do a basic fuzzy check or return empty
    // Placeholder for Vector Search implementation.
    return [];
  }

  async getStrategicHub(projectId) {
    // Fetch Intents and Epics as the core hierarchy
    const intents = await Task.find({ 
      project: projectId, 
      type: 'intent' 
    }).sort({ sasScore: -1 });

    const epics = await Task.find({ 
      project: projectId, 
      type: 'epic' 
    });

    const stories = await Task.find({ 
      project: projectId, 
      type: 'story' 
    });

    return { intents, epics, stories };
  }

  async updateStrategicAlignment(taskId, strategicWeight, storyPoints) {
    const task = await Task.findById(taskId);
    if (!task) throw new AppError('Task not found', 404);

    if (strategicWeight) task.strategicWeight = strategicWeight;
    if (storyPoints) task.storyPoints = storyPoints;

    // Recalculate SAS Score
    task.sasScore = this.calculateSAS(task.strategicWeight, task.storyPoints);
    await task.save();

    return task;
  }

  async getDependencyGraph(projectId) {
    const tasks = await Task.find({ project: projectId }).select('title type status parentId dependencies sasScore');
    
    // Formatting for React Flow / D3 nodes and edges
    const nodes = tasks.map(t => ({
      id: t._id.toString(),
      data: { label: t.title, type: t.type, status: t.status, sas: t.sasScore },
      position: { x: 0, y: 0 } // Layout to be handled on frontend
    }));

    const edges = [];
    tasks.forEach(t => {
      // Parent -> Child relationship
      if (t.parentId) {
        edges.push({
          id: `e-parent-${t.parentId}-${t._id}`,
          source: t.parentId.toString(),
          target: t._id.toString(),
          label: 'parent-of'
        });
      }
      // Explicit dependencies
      if (t.dependencies && t.dependencies.length > 0) {
        t.dependencies.forEach(depId => {
          edges.push({
            id: `e-dep-${depId}-${t._id}`,
            source: depId.toString(),
            target: t._id.toString(),
            label: 'blocks'
          });
        });
      }
    });

    return { nodes, edges };
  }
}

module.exports = new StrategicIntentService();
