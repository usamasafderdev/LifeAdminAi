import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import * as controller from '../controllers/calendarController.js';

const router = express.Router();
router.use(protect);
router.route('/availability').get(controller.getAvailability).put(controller.saveAvailability);
router.route('/events').get(controller.listEvents).post(controller.createEvent);
router.patch('/events/:id', controller.changeEvent);
router.post('/suggestions', controller.suggest);
router.get('/suggestions/:id', controller.proposal);
router.post('/suggestions/:id/accept', controller.accept);
router.post('/suggestions/:id/cancel', controller.cancel);
export default router;
