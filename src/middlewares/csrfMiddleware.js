const crypto = require('crypto');

const csrfProtection = () => {
  return (req, res, next) => {
    // 1. Ensure the client has a csrfToken cookie set if not already present
    if (!req.cookies || !req.cookies.csrfToken) {
      const token = crypto.randomBytes(24).toString('hex');
      res.cookie('csrfToken', token, {
        httpOnly: false, // Read by frontend code to include in headers
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      });
      // Also temporarily set it on req.cookies so that subsequent middleware/validation in the same request can see it if needed
      req.cookies = req.cookies || {};
      req.cookies.csrfToken = token;
    }

    // 2. Skip verification for safe HTTP methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE'];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    // 3. Skip verification for webhooks, health check, and public auth endpoints
    const isWebhook =
      req.originalUrl?.includes('/webhooks') || req.path?.includes('/webhooks');
    const isHealth = req.path?.includes('/health');

    const publicAuthPaths = [
      '/auth/register',
      '/auth/login',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/activate',
    ];
    const isPublicAuth = publicAuthPaths.some((path) =>
      req.path?.includes(path)
    );

    if (isWebhook || isHealth || isPublicAuth) {
      return next();
    }

    // 4. Verify CSRF token for all other unsafe methods
    const cookieToken = req.cookies?.csrfToken;
    const headerToken =
      req.headers['x-csrf-token'] || req.headers['X-CSRF-Token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({
        status: 'fail',
        code: 'CSRF_ERROR',
        message: 'Invalid or missing CSRF token validation.',
      });
    }

    next();
  };
};

module.exports = csrfProtection;
