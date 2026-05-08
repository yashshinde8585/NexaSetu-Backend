const express = require('express');
const directiveController = require('../controllers/directiveController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .post(directiveController.createDirective)
  .get(directiveController.getDirectives);

router.post('/:id/acknowledge', directiveController.acknowledgeDirective);

module.exports = router;
