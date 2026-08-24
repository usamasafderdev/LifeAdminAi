import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, res, next) {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT secret unavailable');
    const payload = jwt.verify(authorization.slice(7).trim(), process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}
