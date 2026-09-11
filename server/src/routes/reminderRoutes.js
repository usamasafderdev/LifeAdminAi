import { Router } from 'express';
import { createReminder, deleteReminder, getReminder, listReminders, updateReminder } from '../controllers/reminderController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect);
router.route('/').post(createReminder).get(listReminders);
router.route('/:id').get(getReminder).patch(updateReminder).delete(deleteReminder);
export default router;
