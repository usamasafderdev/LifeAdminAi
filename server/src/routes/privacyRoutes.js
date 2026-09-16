import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  clearPrivacyChatHistory,
  deletePrivacyAccount,
  exportPrivacyData,
} from '../controllers/privacyController.js';

const router = express.Router();
router.use(protect);
router.get('/export', exportPrivacyData);
router.delete('/chat-history', clearPrivacyChatHistory);
router.delete('/account', deletePrivacyAccount);
export default router;
