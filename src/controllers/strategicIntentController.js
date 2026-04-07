const Task = require('../models/Task');
const strategicIntentService = require('../services/strategicIntentService');

exports.getStrategicHub = async (req, res) => {
  try {
    const { projectId } = req.params;
    
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

    res.status(200).json({
      success: true,
      data: {
        intents,
        epics,
        stories
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.generateFromIntent = async (req, res) => {
  try {
    const { intentId } = req.body;
    const stories = await strategicIntentService.generateStoriesFromIntent(intentId, req.user._id);

    res.status(201).json({
      success: true,
      message: `${stories.length} stories generated from Intent`,
      data: stories
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateStrategicAlignment = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { strategicWeight, storyPoints } = req.body;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    if (strategicWeight) task.strategicWeight = strategicWeight;
    if (storyPoints) task.storyPoints = storyPoints;

    // Recalculate SAS Score
    task.sasScore = strategicIntentService.calculateSAS(task.strategicWeight, task.storyPoints);
    await task.save();

    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getDependencyGraph = async (req, res) => {
  try {
    const { projectId } = req.query;
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

    res.status(200).json({
      success: true,
      data: { nodes, edges }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
