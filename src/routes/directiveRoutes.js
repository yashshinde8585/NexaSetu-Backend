const express = require('express');
const directiveController = require('../controllers/directiveController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .post(directiveController.createDirective)
  .get(directiveController.getDirectives);

/**
 * @swagger
 * /directive/{id}/acknowledge:
 *   post:
 *     summary: Auto-generated summary for POST /directive/{id}/acknowledge
 *     tags: [Directive]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Successful response
 */
router.post('/:id/acknowledge', directiveController.acknowledgeDirective);

module.exports = router;
