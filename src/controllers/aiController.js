const aiService = require('../services/aiService');


exports.extractTask = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ status: 'fail', message: 'Input text is required' });
    }

    const suggestion = await aiService.extractTaskFromText(text);

    res.status(200).json({
      status: 'success',
      data: { suggestion },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message || 'AI extraction failed' });
  }
};
