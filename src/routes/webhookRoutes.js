const express = require('express');
const webhookController = require('../controllers/webhookController');

const router = express.Router();

// Clerk webhooks require raw body for signature verification if using bodyParser.json() globally
// However, express.json() is usually fine if we stringify the body.
router.post('/clerk', express.json(), webhookController.handleClerkWebhook);

module.exports = router;
