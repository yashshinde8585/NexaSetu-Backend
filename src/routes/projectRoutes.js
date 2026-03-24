const express = require('express');
const { createProject, getProjects, getProject } = require('../controllers/projectController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Protect all project routes

router.post('/', createProject);
router.get('/', getProjects);
router.get('/:id', getProject);

module.exports = router;
