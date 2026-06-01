const Task = require('../models/Task');
const aiService = require('./aiService');
const aiHelpers = require('../utils/aiHelpers');
const AppError = require('../utils/appError');

const calculateSAS = (weight, storyPoints = 1) => {
  const { v = 0, u = 0, rm = 0, sf = 0 } = weight || {};
  const effort = Math.max(storyPoints, 1);

  // Weights (could be configurable)
  const weights = { v: 0.4, u: 0.2, rm: 0.2, sf: 0.2 };

  const baseScore =
    weights.v * v + weights.u * u + weights.rm * rm + weights.sf * sf;
  const score = baseScore / Math.sqrt(effort);

  return parseFloat(score.toFixed(2));
};

const generateStoriesFromIntent = async (intentId, userId) => {
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
    const sasScore = calculateSAS(data.strategicWeight, data.storyPoints);

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
      status: 'todo',
    });
    createdStories.push(story);
  }

  return createdStories;
};

const findPotentialDuplicates = async (projectId, text) => {
  // In a real implementation, we'd use vector distance
  return [];
};

const getStrategicHub = async (projectId) => {
  const [intents, epics, stories] = await Promise.all([
    Task.find({ project: projectId, type: 'intent' }).sort({ sasScore: -1 }),
    Task.find({ project: projectId, type: 'epic' }),
    Task.find({ project: projectId, type: 'story' }),
  ]);

  return { intents, epics, stories };
};

const updateStrategicAlignment = async (
  taskId,
  strategicWeight,
  storyPoints
) => {
  const task = await Task.findById(taskId);
  if (!task) throw new AppError('Task not found', 404);

  if (strategicWeight) task.strategicWeight = strategicWeight;
  if (storyPoints) task.storyPoints = storyPoints;

  // Recalculate SAS Score
  task.sasScore = calculateSAS(task.strategicWeight, task.storyPoints);
  await task.save();

  return task;
};

const getDependencyGraph = async (projectId) => {
  const tasks = await Task.find({ project: projectId }).select(
    'title type status parentId dependencies sasScore'
  );

  const nodes = tasks.map((t) => ({
    id: t._id.toString(),
    data: { label: t.title, type: t.type, status: t.status, sas: t.sasScore },
    position: { x: 0, y: 0 },
  }));

  const edges = [];
  tasks.forEach((t) => {
    if (t.parentId) {
      edges.push({
        id: `e-parent-${t.parentId}-${t._id}`,
        source: t.parentId.toString(),
        target: t._id.toString(),
        label: 'parent-of',
      });
    }
    if (t.dependencies && t.dependencies.length > 0) {
      t.dependencies.forEach((depId) => {
        edges.push({
          id: `e-dep-${depId}-${t._id}`,
          source: depId.toString(),
          target: t._id.toString(),
          label: 'blocks',
        });
      });
    }
  });

  return { nodes, edges };
};

module.exports = {
  calculateSAS,
  generateStoriesFromIntent,
  findPotentialDuplicates,
  getStrategicHub,
  updateStrategicAlignment,
  getDependencyGraph,
};
