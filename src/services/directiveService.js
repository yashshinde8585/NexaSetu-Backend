const Directive = require('../models/Directive');
const AppError = require('../utils/appError');
const { getIO, EVENTS } = require('../socket');
const logger = require('../utils/logger');
const { invalidateCache } = require('../middlewares/cacheMiddleware');

const createDirective = async (user, data) => {
  const { type, title, description, priority, scope } = data;

  const directive = await Directive.create({
    type,
    title,
    description,
    priority,
    scope,
    issuedBy: user._id,
    workspaceId: user.workspaceId,
  });

  // Real-time broadcast to all users in the workspace
  try {
    getIO().to(user.workspaceId.toString()).emit('DIRECTIVE_ISSUED', {
      directiveId: directive._id,
      title: directive.title,
      type: directive.type,
      priority: directive.priority,
    });
  } catch (err) {
    logger.warn('[SOCKET] Failed to broadcast directive');
  }

  await invalidateCache(user.workspaceId, '*directive*');

  return directive;
};

const getDirectives = async (workspaceId, status = 'issued') => {
  return await Directive.find({ workspaceId, status })
    .sort('-priority -createdAt')
    .populate('issuedBy', 'name role')
    .lean();
};

const acknowledgeDirective = async (user, directiveId) => {
  const directive = await Directive.findById(directiveId);
  if (!directive) throw new AppError('Directive not found', 404);

  const alreadyAck = directive.acknowledgments.some(
    (ack) => ack.user.toString() === user._id.toString()
  );
  if (!alreadyAck) {
    directive.acknowledgments.push({ user: user._id });
    await directive.save();
  }

  return directive;
};

module.exports = {
  createDirective,
  getDirectives,
  acknowledgeDirective,
};
