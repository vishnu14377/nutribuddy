import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';

// Authenticate: verify JWT from Authorization: Bearer <token>
export const authenticate = async (req, res, next) => {
  try {
    let token;

    // Support both Authorization: Bearer header AND legacy token header
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.headers.token) {
      // backward compat with old frontend
      token = req.headers.token;
    }

    if (!token) {
      return next(new AppError('Authentication required. Please login.', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role || 'user' };
    req.body.userId = decoded.id; // backward compat
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Session expired. Please login again.', 401));
    }
    return next(new AppError('Invalid token. Please login again.', 401));
  }
};

// Backward compat alias
export default authenticate;