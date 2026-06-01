const logger = require('../utils/logger');

const honeypot = (req, res, next) => {
  // Field name is intentionally generic to entice bots
  const botTriggerField = req.body?.registration_source_tracking;

  if (botTriggerField !== undefined && botTriggerField !== '') {
    logger.warn(
      `[BOT-DETECTION] Honeypot triggered by IP: ${req.ip} - Payload: ${JSON.stringify(req.body)}`
    );

    // Return a 200 OK with a fake success message to "sinkhole" the bot
    // This prevents the bot from knowing it was caught and trying a different strategy
    return res.status(200).json({
      status: 'success',
      message: 'Processing request...',
      _hint: 'bot_sinkhole_active',
    });
  }

  next();
};

module.exports = { honeypot };
