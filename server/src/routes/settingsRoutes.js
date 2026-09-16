import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { checkAiConnection } from '../services/ai/aiHealthService.js';

const router = express.Router();
router.use(protect);

router.get('/ai', async (req, res, next) => {
  try {
    const ai = await checkAiConnection();
    res.json({ success: true, ai });
  } catch (error) {
    next(error);
  }
});

export default router;
