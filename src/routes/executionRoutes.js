const express = require('express');
const router = express.Router();
const executionController = require('../controllers/executionController');
const { checkPermission, enforceScope } = require('../services/rbac/permissionGuard');

router.post('/tasks', checkPermission('create:task'), executionController.createTask);
router.patch('/tasks/:id', checkPermission('update:task'), executionController.updateTask);
router.get('/tasks', enforceScope(), executionController.getTasks);

router.post('/sprints', checkPermission('create:sprint'), executionController.createSprint);

module.exports = router;
