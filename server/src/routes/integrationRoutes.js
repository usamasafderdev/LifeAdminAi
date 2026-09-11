import { Router } from 'express';
import { calendar, dashboard } from '../controllers/integrationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();
router.use(protect);
router.get('/dashboard', dashboard);
router.get('/calendar', calendar);
export default router;
