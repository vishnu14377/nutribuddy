import { AppError } from './errorHandler.js';

// authorize(...roles) — role-based access middleware factory
// Usage: router.get('/admin/only', authenticate, authorize('admin'), handler)
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`,
          403
        )
      );
    }

    next();
  };
};
