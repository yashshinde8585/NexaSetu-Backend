const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// Clerk webhooks require raw body for signature verification if using bodyParser.json() globally
// However, express.json() is usually fine if we stringify the body.
/**
 * @swagger
 * /webhook/clerk:
 *   post:
 *     summary: Auto-generated summary for POST /webhook/clerk
 *     tags: [Webhook]
 *     security:
 *       - bearerAuth: []
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
router.post('/clerk', express.json(), webhookController.handleClerkWebhook);

module.exports = router;
