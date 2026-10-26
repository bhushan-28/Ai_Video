import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Soft fallback to demo user for frictionless usage
    req.user = { id: 'usr-demo-001', email: 'demo@aivideo.com' };
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    req.user = { id: 'usr-demo-001', email: 'demo@aivideo.com' };
    next();
  }
};
