import express from 'express';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
} from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.route('/').post(createDocument).get(listDocuments);
router.route('/:id').get(getDocument).patch(updateDocument).delete(deleteDocument);

export default router;
