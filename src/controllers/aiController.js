const aiService = require('../services/aiService');
const { getAiExtractionQueue } = require('../jobs/aiExtractionQueue');

exports.extractTask = async (req, res) => {
  const controller = new AbortController();
  const { signal } = controller;

  req.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res
        .status(400)
        .json({ status: 'fail', message: 'Input text is required' });
    }

    const fastController = new AbortController();
    const fastSignal = fastController.signal;
    const fastTimeout = setTimeout(() => fastController.abort(), 3000);

    try {
      const suggestion = await aiService.extractTaskFromText(text, fastSignal);
      clearTimeout(fastTimeout);

      return res.status(200).json({
        status: 'success',
        data: { suggestion },
      });
    } catch (fastError) {
      clearTimeout(fastTimeout);

      if (
        fastError.name === 'AbortError' ||
        fastError.message.includes('cancelled')
      ) {
        const queue = getAiExtractionQueue();
        const { getJobMetadata } = require('../utils/context');
        if (queue) {
          const job = await queue.add('extract-task', {
            text,
            userId: req.user?._id,
            socketId: req.headers['x-socket-id'],
            ...getJobMetadata(),
          });

          return res.status(202).json({
            status: 'processing',
            data: {
              jobId: job.id,
              message:
                'Task extraction is taking longer than expected. You will be notified via real-time signal.',
            },
          });
        }
      }
      throw fastError;
    }
  } catch (error) {
    if (
      error.name === 'AbortError' ||
      error.message === 'AI request cancelled'
    ) {
      return;
    }

    res.status(500).json({
      status: 'error',
      message: error.message || 'AI extraction failed',
    });
  }
};
