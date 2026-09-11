import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  listMemories,
  updateMemorySettings,
  confirmMemory,
  editMemory,
  deleteMemory,
  deleteAllMemories,
} from '../controllers/memoryController.js';
const router = express.Router();
router.use(protect);
router.route('/').get(listMemories).delete(deleteAllMemories);
router.patch('/settings', updateMemorySettings);
router.post('/confirm', confirmMemory);
router.route('/:id').patch(editMemory).delete(deleteMemory);
export default router;
