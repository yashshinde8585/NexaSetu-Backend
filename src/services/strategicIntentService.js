const Task = require('../models/Task');
const aiService = require('./aiService');
const aiHelpers = require('../utils/aiHelpers');

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
}

module.exports = new StrategicIntentService();
