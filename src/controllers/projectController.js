const Project = require('../models/Project');

// Create new project
exports.createProject = async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ status: 'fail', message: 'Project name is required' });
    }

    const project = await Project.create({
      name,
      createdBy: req.user.id,
      members: [req.user.id],
    });

    res.status(201).json({
      status: 'success',
      data: { project },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

// Get all projects for logged-in user
exports.getProjects = async (req, res) => {
  try {
    // Return projects where user is creator OR a member
    const projects = await Project.find({
      members: req.user.id,
    }).populate('createdBy', 'name email');

    res.status(200).json({
      status: 'success',
      results: projects.length,
      data: { projects },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};

// Get project by ID (ensure member)
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      members: req.user.id,
    }).populate('members', 'name email');

    if (!project) {
      return res.status(404).json({ status: 'fail', message: 'Project not found or you are not a member' });
    }

    res.status(200).json({
      status: 'success',
      data: { project },
    });
  } catch (error) {
    res.status(400).json({ status: 'fail', message: error.message });
  }
};
