import { Router } from 'express';
import { getCurrentUser, googleAuth, login, register } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.get('/me', protect, getCurrentUser);

export default router;
