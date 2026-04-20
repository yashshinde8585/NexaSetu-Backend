const aiRecommendationService = require('../services/aiRecommendationService');
const catchAsync = require('../utils/catchAsync');

// Generates portfolio-level recommendations by analyzing workload distribution and task timelines.
exports.getPortfolioRecommendations = catchAsync(async (req, res, next) => {
  const recommendations = await aiRecommendationService.getPortfolioRecommendations(req.user);

  res.status(200).json({
    status: 'success',
    results: recommendations.length,
    data: {
      recommendations,
    },
  });
});
