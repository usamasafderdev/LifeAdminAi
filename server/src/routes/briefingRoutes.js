import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getBriefing,
  refreshBriefing,
  readBriefingSettings,
  patchBriefingSettings,
} from '../controllers/briefingController.js';
const router = express.Router();
router.use(protect);
router.get('/', getBriefing);
router.post('/refresh', refreshBriefing);
router.route('/settings').get(readBriefingSettings).patch(patchBriefingSettings);
export default router;
