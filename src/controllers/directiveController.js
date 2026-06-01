const directiveService = require('../services/directiveService');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

const createDirective = catchAsync(async (req, res) => {
  // Only Admin, CTO, or VPE can issue directives
  const role = (req.user.role || '').toUpperCase();
  if (!['WORKSPACE_ADMIN', 'CTO', 'VP_ENGINEERING'].includes(role)) {
    throw new AppError('Only leadership can issue strategic directives.', 403);
  }

  const directive = await directiveService.createDirective(req.user, req.body);
  res.status(201).json({
    status: 'success',
    data: { directive },
  });
});

const getDirectives = catchAsync(async (req, res) => {
  const directives = await directiveService.getDirectives(
    req.user.workspaceId,
    req.query.status
  );
  res.status(200).json({
    status: 'success',
    data: { directives },
  });
});

const acknowledgeDirective = catchAsync(async (req, res) => {
  const directive = await directiveService.acknowledgeDirective(
    req.user,
    req.params.id
  );
  res.status(200).json({
    status: 'success',
    data: { directive },
  });
});

module.exports = {
  createDirective,
  getDirectives,
  acknowledgeDirective,
};
