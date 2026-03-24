const express = require('express');
const { createTask, getTasks, updateTask } = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect); // Protect all task routes

router.post('/', createTask);
router.get('/project/:projectId', getTasks);
router.patch('/:id', updateTask);

module.exports = router;
