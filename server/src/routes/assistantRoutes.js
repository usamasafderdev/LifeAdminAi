import express from 'express';
import { clearAssistantChat, getAssistantChat, postAssistantChat } from '../controllers/assistantController.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();
router.use(protect);
router.route('/chat').get(getAssistantChat).post(postAssistantChat).delete(clearAssistantChat);
export default router;
