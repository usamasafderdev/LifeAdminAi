import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { GoogleCredentialError, verifyGoogleCredential } from '../utils/googleAuth.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (email) => email.trim().toLowerCase();
const safeUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  createdAt: user.createdAt,
});

export async function register(req, res, next) {
  try {
    const { fullName, email, password } = req.body ?? {};

    if (typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }
    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: safeUser(user),
      token: generateToken(user._id),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: normalizeEmail(email) }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: safeUser(user),
      token: generateToken(user._id),
    });
  } catch (error) {
    return next(error);
  }
}

export function getCurrentUser(req, res) {
  return res.status(200).json({ success: true, user: safeUser(req.user) });
}

export async function googleAuth(req, res, next) {
  try {
    const { credential } = req.body ?? {};
    if (typeof credential !== 'string' || !credential.trim()) {
      return res.status(400).json({ success: false, message: 'Google credential is required' });
    }

    const payload = await verifyGoogleCredential(credential.trim());
    const { sub, email, email_verified: emailVerified, name, picture } = payload ?? {};
    if (!sub || typeof email !== 'string' || !emailVerified) {
      return res.status(401).json({ success: false, message: 'Google authentication failed' });
    }

    const normalizedEmail = normalizeEmail(email);
    let user = await User.findOne({ googleId: sub });

    if (!user) {
      user = await User.findOne({ email: normalizedEmail });
      if (user) {
        user.googleId = sub;
        if (!user.avatarUrl && picture) user.avatarUrl = picture;
        await user.save();
      } else {
        user = await User.create({
          fullName: typeof name === 'string' && name.trim() ? name.trim() : normalizedEmail.split('@')[0],
          email: normalizedEmail,
          googleId: sub,
          ...(picture ? { avatarUrl: picture } : {}),
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Google authentication successful',
      user: safeUser(user),
      token: generateToken(user._id),
    });
  } catch (error) {
    if (error instanceof GoogleCredentialError) {
      return res.status(401).json({ success: false, message: 'Google authentication failed' });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Google account is already linked' });
    }
    return next(error);
  }
}
