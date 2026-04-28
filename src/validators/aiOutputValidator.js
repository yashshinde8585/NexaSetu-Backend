const AppError = require('../utils/appError');
const logger = require('../utils/logger');

// AI Output Validator: Ensures AI-generated content conforms to system schemas before persistence.
class AIOutputValidator {
  validateTaskEnrichment(data) {
    const allowedFields = ['priority', 'estimatedDuration', 'subtasks', 'tags', 'description'];
    const validatedData = {};

    if (!data || typeof data !== 'object') {
      throw new AppError('AI generated invalid response format', 500);
    }

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        // Basic type validation for critical fields.
        if (field === 'priority' && !['low', 'medium', 'high'].includes(data[field])) return;
        if (field === 'estimatedDuration' && typeof data[field] !== 'number') return;
        if (field === 'subtasks' && !Array.isArray(data[field])) return;
        
        validatedData[field] = data[field];
      }
    });

    if (Object.keys(validatedData).length === 0) {
      logger.warn('[AI VALIDATOR] No valid fields found in AI response');
    }

    return validatedData;
  }
}

module.exports = new AIOutputValidator();
