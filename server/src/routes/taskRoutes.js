import express from 'express';
import { createTask, deleteTask, getTask, listTasks, updateTask } from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);
router.route('/').post(createTask).get(listTasks);
router.route('/:id').get(getTask).patch(updateTask).delete(deleteTask);
export default router;
