const express = require('express');
const { createProject, getProjects, getProject, getProjectAnalytics, updateProject } = require('../controllers/projectController');
const { protect, requirePermission } = require('../middleware/authMiddleware');
const { PERMISSIONS } = require('../config/permissions');

const router = express.Router();

router.use(protect); // Protect all project routes

router.post('/', requirePermission(PERMISSIONS.CREATE_PROJECT), createProject);
router.get('/', getProjects);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.get('/:id/analytics', getProjectAnalytics);

module.exports = router;
