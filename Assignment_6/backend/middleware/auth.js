// JWT authentication & authorization middleware (Checklist #26)
const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'sweetscoop-dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Unauthorized', 'Missing or invalid Authorization header.'));
  }
  const token = authHeader.slice(7);
  try {
    req.customer = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return next(new AppError(401, 'Unauthorized', 'Invalid or expired token.'));
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      req.customer = jwt.verify(authHeader.slice(7), JWT_SECRET);
    } catch (e) { /* ignore */ }
  }
  next();
}

module.exports = { authenticate, optionalAuth, signToken, JWT_SECRET };
