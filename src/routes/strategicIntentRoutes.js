const express = require('express');
const strategicIntentController = require('../controllers/strategicIntentController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/hub/:projectId', strategicIntentController.getStrategicHub);
router.post('/generate', strategicIntentController.generateFromIntent);
router.patch('/alignment/:taskId', strategicIntentController.updateStrategicAlignment);
router.get('/graph', strategicIntentController.getDependencyGraph);

module.exports = router;
